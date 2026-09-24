package backup

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/backup/archive"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/db/dumps"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/user"
)

var (
	extraPathPattern = regexp.MustCompile(contract.Backup.ExtraPathPattern)
	unsafeKey        = regexp.MustCompile(`[^A-Za-z0-9._-]+`)
)

// A configuration file is kilobytes; a setup archive over this is not one this agent wrote.
const setupLimit = 16 << 20

// setup is the part a backup cannot do without: when it fails, the backup stops there.
func (j *job) setup() error {
	files, fingerprint, err := j.service.setupFiles(j.ctx)
	if err != nil {
		j.warn(contract.BackupPartSetup, err)

		return err
	}

	return j.carry(source{
		step:        contract.BackupPartSetup,
		part:        contract.BackupPart{Kind: contract.BackupPartSetup},
		fingerprint: fingerprint,
		produce:     func(w io.Writer) error { return archive.WriteFiles(w, files) },
	})
}

// setupFiles reads the configuration that exists, under its name in the archive; its fingerprint is its content.
func (s *Service) setupFiles(ctx sys.Context) ([]archive.File, string, error) {
	var files []archive.File
	digest := sha256.New()

	for _, entry := range s.paths.Setup {
		content, err := ctx.Sys().ReadFile(entry.Path)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, "", err
		}

		_, modified, _ := ctx.Sys().Stat(entry.Path)
		files = append(files, archive.File{Name: entry.Name, Content: content, Mode: 0o600, ModTime: modified})
		fmt.Fprintf(digest, "%s\x00%d\x00", entry.Name, len(content))
		digest.Write(content)
	}

	return files, hex.EncodeToString(digest.Sum(nil)), nil
}

// home carries the keys and sessions of the dev account that exist, never authorized_keys: the platform writes that one.
func (j *job) home() {
	root := j.service.paths.Home

	var present []string
	for _, entry := range contract.Backup.HomePaths {
		if _, err := os.Lstat(filepath.Join(root, entry)); err == nil {
			present = append(present, entry)
		}
	}

	if len(present) == 0 {
		return
	}

	tree := archive.Source{Root: root, Entries: present, Skip: archive.ExcludingPaths(contract.Backup.HomeExcluded)}
	j.tree(contract.BackupPartHome, contract.BackupPart{Kind: contract.BackupPartHome, Paths: present}, tree)
}

// tree carries a folder: its fingerprint is read first, and a fingerprint that does not read only costs the copy.
func (j *job) tree(step string, part contract.BackupPart, tree archive.Source) {
	fingerprint, err := archive.Fingerprint(tree, step)
	if err != nil {
		j.ctx.Logf("%s: no fingerprint (%s), sent whole", step, err)
		fingerprint = ""
	}

	_ = j.carry(source{
		step:        step,
		part:        part,
		fingerprint: fingerprint,
		produce:     func(w io.Writer) error { return archive.Write(w, tree) },
	})
}

// databases carries every database the settings do not leave out, engine after engine.
func (j *job) databases() {
	for _, held := range j.service.holdings(j.ctx) {
		if held.err != nil {
			j.warn(dbStep(held.engine.name, contract.BackupWholeServer), held.err)

			continue
		}

		j.engine(held)
	}
}

// With the category switched off every database is left out, and recorded so; an engine that does not answer cannot say what it holds.
func (j *job) leaveOutDatabases() {
	for _, held := range j.service.holdings(j.ctx) {
		if held.err != nil {
			j.warn(dbStep(held.engine.name, contract.BackupWholeServer), held.err)

			continue
		}

		for _, item := range held.items() {
			j.excluded.Databases = append(j.excluded.Databases, item.Item)
		}
	}
}

// An engine's whole-server part — roles, accounts — goes first, and only with one of its databases: a restored database needs its owners, and nothing else does.
func (j *job) engine(held holding) {
	engine, sibling := held.engine, held.sibling

	var going []string
	for _, name := range held.names {
		item := contract.DatabaseItem(engine.name, name)

		switch {
		case !carriable(name):
			j.warnings = append(j.warnings, i18n.T("backup.database.skipped", engine.name, name))
		case j.settings.LeavesOutDatabase(item):
			j.excluded.Databases = append(j.excluded.Databases, item)
		default:
			going = append(going, name)
		}
	}

	if whole := engine.whole; whole != nil {
		snapshot := engine.list == nil
		item := contract.DatabaseItem(engine.name, contract.BackupWholeServer)

		switch {
		case snapshot && j.settings.LeavesOutDatabase(item):
			j.excluded.Databases = append(j.excluded.Databases, item)
		case snapshot || len(going) > 0:
			_ = j.carry(source{
				step:    dbStep(engine.name, contract.BackupWholeServer),
				part:    contract.BackupPart{Kind: contract.BackupPartDatabase, Engine: engine.name, Name: contract.BackupWholeServer, Format: whole.format},
				produce: func(w io.Writer) error { return whole.dump(sibling, w) },
			})
		}
	}

	for _, name := range going {
		_ = j.carry(source{
			step:    dbStep(engine.name, name),
			part:    contract.BackupPart{Kind: contract.BackupPartDatabase, Engine: engine.name, Name: name, Format: engine.format},
			produce: func(w io.Writer) error { return engine.dump(sibling, name, w) },
		})
	}
}

// A database name reaches an argv and a statement as it is: one that could be read as an option, or break out of a quote, is left out and said.
func carriable(name string) bool {
	return dumps.SafeName(name) && !strings.HasPrefix(name, "-")
}

// installed is a database module's own context, when the module says it is on the machine.
func (s *Service) installed(ctx *modules.Context, id string) (*modules.Context, bool) {
	sibling, known := ctx.Sibling(id)
	if !known {
		return nil, false
	}

	held, known := s.options.Engine.Registry.Get(id)
	if !known {
		return nil, false
	}

	status, err := held.Check(sibling)

	return sibling, err == nil && status.Installed
}

// projects carries each declared project as the mode says: its folder, or its ignored .env files; a project without a repository is always carried whole.
// With the category switched off every project is left out, and recorded so: a restore then treats each as if it had been unticked.
func (j *job) projects(mode string) {
	declared, err := j.service.options.Reader.Declared()
	if err != nil {
		j.warn(contract.BackupPartProject, err)

		return
	}

	for _, project := range declared {
		if mode == contract.BackupProjectsNone || j.settings.LeavesOutProject(project.Name) {
			j.excluded.Projects = append(j.excluded.Projects, project.Name)

			continue
		}

		j.project(project, mode)
	}
}

func (j *job) project(project contract.Project, mode string) {
	step := contract.BackupPartProject + ":" + project.Name

	if info, err := os.Stat(project.Path); err != nil || !info.IsDir() {
		j.warnings = append(j.warnings, i18n.T("backup.project.missing", project.Name, project.Path))

		return
	}

	if project.Repo == "" {
		mode = contract.BackupProjectsFull
	}

	part := contract.BackupPart{Kind: contract.BackupPartProject, Name: project.Name, Mode: mode}
	if held, found := j.service.options.Reader.Held(project.Name); found {
		part.Git = &held
	}

	tree := archive.Source{Root: project.Path, Entries: []string{archive.Whole}, Skip: archive.ExcludingDirs(contract.Backup.ExcludedDirs)}
	if mode == contract.BackupProjectsEnv {
		files, err := j.envFiles(project)
		if err != nil {
			j.warn(step, err)

			return
		}

		tree = archive.Source{Root: project.Path, Entries: files}
	}

	j.tree(step, part, tree)
}

// envFiles are the .env files at the root and in each process folder that git ignores: what a clone does not bring back.
func (j *job) envFiles(project contract.Project) ([]string, error) {
	folders := []string{project.Path}
	for _, process := range project.Processes {
		if !slices.Contains(folders, process.Path) {
			folders = append(folders, process.Path)
		}
	}

	var candidates []string
	for _, folder := range folders {
		entries, err := os.ReadDir(folder)
		if err != nil {
			continue
		}

		for _, entry := range entries {
			if !strings.HasPrefix(entry.Name(), ".env") || !entry.Type().IsRegular() {
				continue
			}

			if rel, err := filepath.Rel(project.Path, filepath.Join(folder, entry.Name())); err == nil {
				candidates = append(candidates, filepath.ToSlash(rel))
			}
		}
	}

	if len(candidates) == 0 {
		return nil, nil
	}

	out, err := user.RunWith(j.ctx, j.service.options.Owner, user.Input{Dir: project.Path}, append([]string{"git", "check-ignore", "--"}, candidates...)...)

	var exit *sys.ExitError
	if errors.As(err, &exit) && exit.Code == 1 {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	var ignored []string
	for _, line := range strings.Split(out, "\n") {
		if name := strings.TrimSpace(line); slices.Contains(candidates, name) {
			ignored = append(ignored, name)
		}
	}

	return ignored, nil
}

// paths carries each extra folder of the dev account, relative to its home.
func (j *job) paths() {
	root := j.service.paths.Home

	for _, wanted := range j.settings.ExtraPaths {
		step := contract.BackupPartPath + ":" + wanted
		rel := strings.TrimSuffix(wanted, "/")

		if !extraPathPattern.MatchString(wanted) {
			j.warnings = append(j.warnings, i18n.T("backup.path.refused", wanted))

			continue
		}

		if _, err := os.Lstat(filepath.Join(root, rel)); err != nil {
			j.warnings = append(j.warnings, i18n.T("backup.path.missing", wanted))

			continue
		}

		j.tree(step, contract.BackupPart{Kind: contract.BackupPartPath, Path: wanted}, archive.Source{Root: root, Entries: []string{rel}})
	}
}

// keyFor names a part's object after what it holds, once in a backup.
func (j *job) keyFor(part contract.BackupPart) string {
	var base string

	switch part.Kind {
	case contract.BackupPartDatabase:
		base = "db-" + part.Engine + "-" + part.Name
		switch part.Format {
		case contract.BackupDumpPgRoles:
			base = "db-" + part.Engine + "-roles"
		case contract.BackupDumpMySQLUsers:
			base = "db-" + part.Engine + "-users"
		case contract.BackupDumpRDB:
			base = "db-" + part.Engine
		}
	case contract.BackupPartProject:
		base = "project-" + part.Name
	case contract.BackupPartPath:
		base = "path-" + strings.Trim(strings.ReplaceAll(strings.TrimSuffix(part.Path, "/"), "/", "-"), "-")
	default:
		base = part.Kind
	}

	base = strings.Trim(unsafeKey.ReplaceAllString(base, "-"), "-.")

	key := base
	for rank := 2; j.taken[key]; rank++ {
		key = base + "-" + strconv.Itoa(rank)
	}

	j.taken[key] = true

	return key + partSuffix
}

// stepOf is the step a part was made under, which is also what the next backup recognises it by.
func stepOf(part contract.BackupPart) string {
	switch part.Kind {
	case contract.BackupPartDatabase:
		return dbStep(part.Engine, part.Name)
	case contract.BackupPartProject:
		return contract.BackupPartProject + ":" + part.Name
	case contract.BackupPartPath:
		return contract.BackupPartPath + ":" + part.Path
	}

	return part.Kind
}

func dbStep(engine, name string) string {
	return "db:" + engine + ":" + name
}

func sha256Hex(content []byte) string {
	sum := sha256.Sum256(content)

	return hex.EncodeToString(sum[:])
}
