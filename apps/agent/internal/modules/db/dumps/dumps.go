// Package dumps imports the dumps the client leaves in ~/dumps/, once each, whatever the engine.
package dumps

import (
	"path"
	"regexp"
	"sort"
	"strings"

	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const (
	Dir       = "/home/dev/dumps"
	markerDir = "/var/lib/pupitre/dumps"
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
var safeName = regexp.MustCompile(`^[A-Za-z0-9_-]{1,64}$`)

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

// gunzip -c … | mysql would need a shell; decompressing beside the archive and removing the copy keeps every command to an argv.
func prepare(ctx *modules.Context, dump File, native bool) (File, func(), error) {
	if !dump.Gzip || native {
		return dump, func() {}, nil
	}

	plain := strings.TrimSuffix(dump.Path, ".gz")
	if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"gzip", "--decompress", "--keep", "--force", dump.Path}}); err != nil {
		return File{}, func() {}, err
	}

	dump.Path, dump.Gzip = plain, false

	return dump, func() { file.Remove(ctx, plain) }, nil
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
		ctx.Warn("dossier " + Dir + " illisible, aucun dump importé : " + err.Error())

		return nil
	}

	var found []File
	for _, line := range strings.Split(out.Stdout, "\n") {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}

		name := database(path.Base(trimmed))
		if !safeName.MatchString(name) {
			ctx.Warn(path.Base(trimmed) + " ignoré : le nom de base qu'il porte n'est pas utilisable")

			continue
		}

		found = append(found, File{Path: trimmed, Database: name, Gzip: strings.HasSuffix(trimmed, ".gz")})
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

	return append(argv, ")")
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
