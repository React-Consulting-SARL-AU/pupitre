package backup

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"io/fs"
	"maps"
	"os"
	"path/filepath"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/backup/archive"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/modules/exposure"
	"pupitre.studio/agent/internal/protocol"
)

type restoring struct {
	service  *Service
	ctx      *modules.Context
	backup   opened
	private  []byte
	owner    archive.Owner
	projects map[string]contract.Project
	brought  []string
	result   contract.BackupRestoreDataResult
}

func (s *Service) RestoreData(sink modules.Sink, location contract.BackupLocation, secrets contract.BackupSecrets, keys []string, start bool) (contract.BackupRestoreDataResult, error) {
	var result contract.BackupRestoreDataResult

	err := s.options.Engine.Command(module.ID, sink, func(ctx *modules.Context) error {
		restored, err := s.restoreData(ctx, location, secrets, keys, start)
		result = restored

		return err
	})

	return result, err
}

func (s *Service) restoreData(ctx *modules.Context, location contract.BackupLocation, secrets contract.BackupSecrets, keys []string, start bool) (contract.BackupRestoreDataResult, error) {
	backup, err := s.open(ctx, location, secrets)
	if err != nil {
		return contract.BackupRestoreDataResult{}, err
	}

	private, err := backup.identity(secrets)
	if err != nil {
		return contract.BackupRestoreDataResult{}, err
	}
	defer clear(private)

	chosen, err := choose(backup.manifest.Parts, keys)
	if err != nil {
		return contract.BackupRestoreDataResult{}, err
	}

	owner, err := archive.Lookup(s.options.Owner)
	if err != nil {
		return contract.BackupRestoreDataResult{}, err
	}

	r := &restoring{
		service:  s,
		ctx:      ctx,
		backup:   backup,
		private:  private,
		owner:    owner,
		projects: s.declared(),
		result:   contract.BackupRestoreDataResult{Restored: []string{}, Failed: []string{}, Started: []string{}, Warnings: []string{}},
	}

	for _, part := range chosen {
		r.bring(part)
	}

	if marker, restoring := s.marker(ctx); restoring && !marker.Revert && backup.manifest.Excluded != nil {
		r.leftOut(*backup.manifest.Excluded)
	}

	r.settle(backup.manifest, start)

	if err := s.clearMarker(ctx); err != nil {
		ctx.Logf("restore marker not cleared: %s", err)
	}

	return r.result, nil
}

// Restore order: home, Postgres roles before the databases that need them, extra paths, then projects.
func choose(parts []contract.BackupPart, keys []string) ([]contract.BackupPart, error) {
	var chosen []contract.BackupPart

	for _, key := range keys {
		index := slices.IndexFunc(parts, func(part contract.BackupPart) bool { return part.Key == key })
		if index < 0 || parts[index].Kind == contract.BackupPartSetup {
			return nil, protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.part.unknown", key)).
				WithFix(i18n.T("backup.part.unknown.fix"))
		}

		chosen = append(chosen, parts[index])
	}

	slices.SortStableFunc(chosen, func(a, b contract.BackupPart) int { return rank(a) - rank(b) })

	return chosen, nil
}

func rank(part contract.BackupPart) int {
	switch {
	case part.Kind == contract.BackupPartHome:
		return 0
	case part.Format == contract.BackupDumpPgRoles:
		return 1
	case part.Kind == contract.BackupPartDatabase:
		return 2
	case part.Kind == contract.BackupPartPath:
		return 3
	}

	return 4
}

func (s *Service) declared() map[string]contract.Project {
	projects := map[string]contract.Project{}

	declared, err := s.options.Reader.Declared()
	if err != nil {
		return projects
	}

	for _, project := range declared {
		projects[project.Name] = project
	}

	return projects
}

func (r *restoring) bring(part contract.BackupPart) {
	step := stepOf(part)
	r.ctx.Replaying(replayOf("backup.restore.data", map[string]any{"parts": []string{part.Key}}))

	var failure error

	err := r.ctx.Step(step, func() (modules.Outcome, error) {
		if err := r.restore(part); err != nil {
			failure = err

			return modules.Failed, errors.New(describe(err))
		}

		return modules.Done, nil
	})

	if err != nil {
		r.result.Failed = append(r.result.Failed, part.Key)
		r.result.Warnings = append(r.result.Warnings, i18n.T("backup.part.failed", step, describe(failure)))

		return
	}

	r.result.Restored = append(r.result.Restored, part.Key)
}

func (r *restoring) restore(part contract.BackupPart) error {
	staged, err := r.service.part(r.backup, part, r.private)
	if err != nil {
		return err
	}
	defer staged.Close()

	if part.Kind == contract.BackupPartDatabase {
		return r.database(part, staged)
	}

	reader, err := staged.open()
	if err != nil {
		return err
	}

	switch part.Kind {
	case contract.BackupPartHome:
		return archive.Extract(reader, r.service.paths.Home, r.owner)
	case contract.BackupPartPath:
		return r.path(part, reader)
	}

	return r.project(part, reader)
}

// The dump is measured first: the engine weighs its size against the disk before it drops anything.
func (r *restoring) database(part contract.BackupPart, staged *fetched) error {
	chosen, known := engineNamed(part.Engine)
	if !known || (part.Name != contract.BackupWholeServer && !carriable(part.Name)) {
		return corrupt(i18n.T("backup.corrupt.part", part.Key, part.Engine+"/"+part.Name))
	}

	sibling, installed := r.service.installed(r.ctx, chosen.module)
	if !installed {
		return protocol.NewError(contract.ErrorModuleNotFound, i18n.T("backup.restore.engine", chosen.module)).
			WithFix(i18n.T("backup.restore.engine.fix", chosen.module))
	}

	if part.Name == contract.BackupWholeServer && chosen.whole != nil {
		reader, err := staged.open()
		if err != nil {
			return err
		}

		return chosen.whole.restore(sibling, reader)
	}

	size, err := staged.measure()
	if err != nil {
		return err
	}

	reader, err := staged.open()
	if err != nil {
		return err
	}

	return chosen.restore(sibling, part.Name, size, reader)
}

// Laid out beside the home first, then swapped in whole.
func (r *restoring) path(part contract.BackupPart, reader io.Reader) error {
	rel := strings.TrimSuffix(part.Path, "/")

	if !extraPathPattern.MatchString(part.Path) {
		return corrupt(i18n.T("backup.corrupt.part", part.Key, part.Path))
	}

	home, err := os.OpenRoot(r.service.paths.Home)
	if err != nil {
		return err
	}
	defer home.Close()

	staged, err := archive.Staging(home, ".", "path", r.owner)
	if err != nil {
		return err
	}
	defer home.RemoveAll(staged)

	if err := archive.ExtractIn(reader, home, staged, r.owner); err != nil {
		return err
	}

	target := filepath.Join(r.service.paths.Home, rel)

	if resolved, err := r.through(target); err == nil && resolved != target {
		within, err := r.inHome(resolved)
		if err != nil {
			return err
		}

		return archive.Swap(home, filepath.Join(staged, rel), within)
	}

	if err := archive.MakeDirs(home, filepath.Dir(rel), r.owner); err != nil {
		return err
	}

	return archive.Swap(home, filepath.Join(staged, rel), rel)
}

// A folder dev linked comes back where the link leads, when that is inside the home; the link stays.
func (r *restoring) through(target string) (string, error) {
	info, err := os.Lstat(target)
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		return target, nil
	}

	return archive.Resolve(target, r.service.paths.Home)
}

// Full mode replaces the folder whole, unpushed work included; env mode clones, then adds the .env files.
func (r *restoring) project(part contract.BackupPart, reader io.Reader) error {
	project, declared := r.projects[part.Name]
	if !declared {
		return protocol.NewError(contract.ErrorProjectNotFound, i18n.T("backup.restore.project", part.Name)).
			WithFix(i18n.T("backup.restore.project.fix"))
	}

	destination, err := r.through(project.Path)

	if part.Mode == contract.BackupProjectsEnv {
		if err != nil {
			return err
		}

		within, err := r.inHome(destination)
		if err != nil {
			return err
		}

		if _, err := r.service.options.Reader.Pull(part.Name); err != nil {
			return err
		}

		home, err := os.OpenRoot(r.service.paths.Home)
		if err != nil {
			return err
		}
		defer home.Close()

		if err := archive.ExtractIn(reader, home, within, r.owner); err != nil {
			return err
		}

		r.brought = append(r.brought, part.Name)

		return nil
	}

	if err != nil {
		destination = project.Path
	}

	within, err := r.inHome(destination)
	if err != nil {
		return err
	}

	home, err := os.OpenRoot(r.service.paths.Home)
	if err != nil {
		return err
	}
	defer home.Close()

	parent := filepath.Dir(within)

	if _, err := home.Stat(parent); errors.Is(err, fs.ErrNotExist) {
		if err := archive.MakeDirs(home, parent, r.owner); err != nil {
			return err
		}
	}

	staged, err := archive.Staging(home, parent, part.Name, r.owner)
	if err != nil {
		return err
	}
	defer home.RemoveAll(staged)

	if err := archive.ExtractIn(reader, home, staged, r.owner); err != nil {
		return err
	}

	if err := archive.Swap(home, staged, within); err != nil {
		return err
	}

	r.brought = append(r.brought, part.Name)

	return nil
}

// The home's own links (a temporary folder's on macOS) spell it one more way, so both spellings are tried.
func (r *restoring) inHome(full string) (string, error) {
	bases := []string{r.service.paths.Home}

	if evaluated, err := filepath.EvalSymlinks(r.service.paths.Home); err == nil {
		bases = append(bases, evaluated)
	}

	for _, base := range bases {
		if rel, err := filepath.Rel(base, full); err == nil && filepath.IsLocal(rel) {
			return rel, nil
		}
	}

	return "", &archive.UnsafeError{Name: full}
}

// Only a fresh server acts on what the settings kept out; a server taken back to its backup keeps its own.
func (r *restoring) leftOut(excluded contract.BackupExcluded) {
	reader := r.service.options.Reader

	for _, name := range excluded.Projects {
		project, declared := r.projects[name]
		if !declared {
			continue
		}

		step := contract.BackupPartProject + ":" + name

		if project.Repo == "" {
			if r.after(step, replayOf("project.remove", map[string]any{"name": name}), func() (modules.Outcome, error) {
				_, err := reader.Remove(name)

				return modules.Done, err
			}) {
				delete(r.projects, name)
				r.result.Warnings = append(r.result.Warnings, i18n.T("backup.excluded.dropped", name))
			}

			continue
		}

		if r.after(step, replayOf("project.pull", map[string]any{"name": name}), func() (modules.Outcome, error) {
			_, err := reader.Pull(name)

			return modules.Done, err
		}) {
			r.brought = append(r.brought, name)
			r.result.Warnings = append(r.result.Warnings, i18n.T("backup.excluded.cloned", name))
		}
	}

	for _, item := range excluded.Databases {
		r.result.Warnings = append(r.result.Warnings, i18n.T("backup.excluded.database", item))
	}
}

// Gives the restored registry what project.add gives a new row, then starts what ran.
func (r *restoring) settle(manifest contract.BackupManifest, start bool) {
	reader := r.service.options.Reader

	r.after("hosts", replayOf("backup.restore.data", nil), func() (modules.Outcome, error) {
		return modules.Done, reader.SyncHosts()
	})

	r.after("runtimes", replayOf("backup.restore.data", nil), func() (modules.Outcome, error) {
		for _, name := range slices.Sorted(maps.Keys(r.projects)) {
			if _, err := os.Stat(r.projects[name].Path); err == nil {
				if err := reader.PinRuntimes(name); err != nil {
					return modules.Failed, err
				}
			}
		}

		return modules.Done, nil
	})

	r.after("routes", replayOf("tunnel.sync", nil), func() (modules.Outcome, error) {
		synced, err := exposure.Resync(r.ctx.Sibling)
		if err != nil || !synced {
			return modules.Skipped, err
		}

		return modules.Done, nil
	})

	for _, name := range r.brought {
		r.after("install:"+name, replayOf("project.install", map[string]any{"name": name}), func() (modules.Outcome, error) {
			_, err := reader.Install(context.Background(), name, "", func(string) {})

			return modules.Done, err
		})
	}

	if start {
		r.start(manifest)
	}
}

func (r *restoring) start(manifest contract.BackupManifest) {
	var names []string

	for _, name := range manifest.Running {
		if _, declared := r.projects[name]; declared && !slices.Contains(names, name) {
			names = append(names, name)
		}
	}

	for _, name := range slices.Sorted(maps.Keys(r.projects)) {
		if r.projects[name].Boot && !slices.Contains(names, name) {
			names = append(names, name)
		}
	}

	for _, name := range names {
		if r.after("start:"+name, replayOf("project.up", map[string]any{"name": name}), func() (modules.Outcome, error) {
			_, err := r.service.options.Reader.Up(name, "")

			return modules.Done, err
		}) {
			r.result.Started = append(r.result.Started, name)
		}
	}
}

// A failure is a warning with its replay, and the next step runs all the same.
func (r *restoring) after(step, replay string, run func() (modules.Outcome, error)) bool {
	r.ctx.Replaying(replay)

	var failure error

	err := r.ctx.Step(step, func() (modules.Outcome, error) {
		outcome, err := run()
		if err != nil {
			failure = err

			return modules.Failed, errors.New(describe(err))
		}

		return outcome, nil
	})
	if err != nil {
		r.result.Warnings = append(r.result.Warnings, i18n.T("backup.part.failed", step, describe(failure)))

		return false
	}

	return true
}

// The replay is an app request: a restore's key never lands on the machine, so it has no local command.
func replayOf(cmd string, params map[string]any) string {
	if params == nil {
		return cmd
	}

	encoded, err := json.Marshal(params)
	if err != nil {
		return cmd
	}

	return cmd + " " + string(encoded)
}
