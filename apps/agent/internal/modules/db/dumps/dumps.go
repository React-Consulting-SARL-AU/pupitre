// Package dumps imports the dumps the client leaves in ~/dumps/, once each, whatever the engine.
package dumps

import (
	"io"
	"path"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	home        = shell.Home
	dumpsFolder = "dumps"
	Dir         = home + "/" + dumpsFolder
	Owner       = shell.User
	markerDir   = "/var/lib/pupitre/dumps"
	tempPrefix  = ".pupitre-import-"
)

type File struct {
	Path     string
	Database string
	Gzip     bool
}

type Options struct {
	Patterns   []string
	NativeGzip bool
	Only       string
	Force      bool
	Load       func(File) error
}

var namedDump = regexp.MustCompile(`^(?:fulldump|dump)_([A-Za-z0-9_]+)_[0-9]+\.`)

var unsafeInStep = regexp.MustCompile(`[^a-z0-9]+`)

// The name reaches an SQL identifier and a shell-free argv; anything else is left alone rather than quoted into a surprise.
// It never starts with a dash, which mysql, pg_dump and mongodump would read as an option.
var safeName = regexp.MustCompile(`^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$`)

// SafeName says whether a database name can reach an identifier, a path under ~/dumps and an argv as it is.
func SafeName(name string) bool {
	return safeName.MatchString(name)
}

// Write streams a dump into a file root makes for dev in ~/dumps: a dump tool told a path would follow a link dev planted there.
func Write(ctx *modules.Context, name, suffix string, dump func(out io.Writer) error) (string, int64, error) {
	if err := ctx.Sys().MkdirIn(home, dumpsFolder, Owner); err != nil {
		return "", 0, err
	}

	rel := dumpsFolder + "/" + name + "_" + ctx.Now().Format("20060102-1504") + suffix

	out, err := ctx.Sys().CreateIn(home, rel, Owner)
	if err != nil {
		return "", 0, err
	}

	dumped := dump(out)
	if closed := out.Close(); dumped == nil {
		dumped = closed
	}

	if dumped != nil {
		ctx.Sys().RemoveIn(home, rel, false)

		return "", 0, dumped
	}

	written, err := ctx.Sys().StatIn(home, rel)
	if err != nil {
		return "", 0, err
	}

	return home + "/" + rel, written.SizeBytes, nil
}

// One step per dump, named after its database: the report says what was imported without naming a single secret.
func Import(ctx *modules.Context, options Options) ([]string, error) {
	pending := waiting(ctx, options)
	if len(pending) == 0 {
		return nil, ctx.Step("import-dumps", func() (modules.Outcome, error) {
			return modules.Skipped, nil
		})
	}

	if err := ctx.Sys().MkdirAll(markerDir, 0o755); err != nil {
		return nil, err
	}

	var imported []string
	for _, dump := range pending {
		if load(ctx, dump, options) {
			imported = append(imported, dump.Database)
		}
	}

	return imported, nil
}

func load(ctx *modules.Context, dump File, options Options) (done bool) {
	err := ctx.Step("import-"+step(dump.Database), func() (modules.Outcome, error) {
		ready, cleanup, err := prepare(ctx, dump, options.NativeGzip)
		if err != nil {
			return modules.Failed, err
		}
		defer cleanup()

		if err := options.Load(ready); err != nil {
			return modules.Failed, err
		}

		done = true

		return modules.Done, mark(ctx, dump)
	})

	return err == nil && done
}

// gunzip -c … | mysql would need a shell; decompressing beside the archive
// keeps every command to an argv. gzip reads the archive on a standard input
// root opens, which refuses a link dev planted, and writes to a file root
// makes under a name of its own: a plain x.sql the client left beside x.sql.gz
// is neither overwritten nor taken away with the copy.
func prepare(ctx *modules.Context, dump File, native bool) (File, func(), error) {
	if !dump.Gzip || native {
		return dump, func() {}, nil
	}

	rel := dumpsFolder + "/" + tempPrefix + strings.TrimSuffix(path.Base(dump.Path), ".gz")
	cleanup := func() { ctx.Sys().RemoveIn(home, rel, false) }

	out, err := ctx.Sys().CreateIn(home, rel, "")
	if err != nil {
		return File{}, func() {}, err
	}

	_, err = sys.Exec(ctx, sys.Command{Argv: []string{"gzip", "--decompress", "--stdout"}, StdinPath: dump.Path, Output: out})
	if closed := out.Close(); err == nil {
		err = closed
	}

	if err != nil {
		cleanup()

		return File{}, func() {}, err
	}

	dump.Path, dump.Gzip = home+"/"+rel, false

	return dump, cleanup, nil
}

func mark(ctx *modules.Context, dump File) error {
	return file.WriteAtomic(ctx, marker(dump.Path), []byte(dump.Database+"\n"), 0o644)
}

func waiting(ctx *modules.Context, options Options) []File {
	var pending []File
	for _, dump := range discover(ctx, options.Patterns) {
		if options.Only != "" && dump.Database != options.Only {
			continue
		}

		if !options.Force && file.Exists(ctx, marker(dump.Path)) {
			continue
		}

		pending = append(pending, dump)
	}

	return pending
}

func discover(ctx *modules.Context, patterns []string) []File {
	if !file.Exists(ctx, Dir) {
		return nil
	}

	out, err := sys.Exec(ctx, sys.Command{Argv: find(patterns)})
	if err != nil {
		ctx.Warn(i18n.T("warn.dumps.dir.unreadable", Dir, err.Error()))

		return nil
	}

	// A file name may hold a newline, never a NUL: find -print0 is the only listing that cannot be split in the wrong place.
	var found []File
	for _, listed := range strings.Split(out.Stdout, "\x00") {
		if listed == "" {
			continue
		}

		name := database(path.Base(listed))
		if !safeName.MatchString(name) {
			ctx.Warn(i18n.T("warn.dumps.name.refused", strconv.Quote(path.Base(listed))))

			continue
		}

		found = append(found, File{Path: listed, Database: name, Gzip: strings.HasSuffix(listed, ".gz")})
	}

	sort.SliceStable(found, func(i, j int) bool { return found[i].Path < found[j].Path })

	return found
}

func find(patterns []string) []string {
	argv := []string{"find", Dir, "-maxdepth", "1", "-type", "f", "("}
	for i, pattern := range patterns {
		if i > 0 {
			argv = append(argv, "-o")
		}
		argv = append(argv, "-name", pattern)
	}

	return append(argv, ")", "-print0")
}

func marker(dumpPath string) string {
	return markerDir + "/" + path.Base(dumpPath) + ".done"
}

// "fulldump_shop_20260101.sql" feeds shop, "intranet.sql" feeds intranet.
func database(name string) string {
	if match := namedDump.FindStringSubmatch(name); match != nil {
		return match[1]
	}

	base, _, _ := strings.Cut(name, ".")

	return base
}

func step(name string) string {
	return strings.Trim(unsafeInStep.ReplaceAllString(strings.ToLower(name), "-"), "-")
}
