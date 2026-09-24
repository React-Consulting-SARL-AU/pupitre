package backup

import (
	"context"
	"encoding/json"
	"errors"
	"io"
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

// restoring is one restore of data under way: the backup, the key that opens it, whom the files go to, and what came back.
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

// RestoreData brings the chosen parts back, then gives each project what project.add gives a new row and starts what ran.
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

// choose reads the parts asked for in the order they come back: home, the databases with the Postgres roles first, the extra paths, the projects.
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
	reader, err := r.service.part(r.backup, part, r.private)
	if err != nil {
		return err
	}
	defer reader.Close()

	switch part.Kind {
	case contract.BackupPartHome:
		return archive.Extract(reader, r.service.paths.Home, r.owner)
	case contract.BackupPartDatabase:
		return r.database(part, reader)
	case contract.BackupPartPath:
		return r.path(part, reader)
	}

	return r.project(part, reader)
}

// A database is dropped and made again by its own engine; one whose module is not installed yet has nowhere to go.
func (r *restoring) database(part contract.BackupPart, reader io.Reader) error {
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
		return chosen.whole.restore(sibling, reader)
	}

	return chosen.restore(sibling, part.Name, reader)
}

// An extra path is replaced whole: laid out beside the home first, then swapped in.
func (r *restoring) path(part contract.BackupPart, reader io.Reader) error {
	home := r.service.paths.Home
	rel := strings.TrimSuffix(part.Path, "/")

	if !extraPathPattern.MatchString(part.Path) {
		return corrupt(i18n.T("backup.corrupt.part", part.Key, part.Path))
	}

	staged, err := archive.Staging(home, "path", r.owner)
	if err != nil {
		return err
	}
	defer os.RemoveAll(staged)

	if err := archive.Extract(reader, staged, r.owner); err != nil {
		return err
	}

	target := filepath.Join(home, rel)
	if err := archive.MakeDirs(home, filepath.Dir(target), r.owner); err != nil {
		return err
	}

	return archive.Swap(filepath.Join(staged, rel), target)
}

// A full project replaces its folder whole, work not pushed included; an env project is cloned, then gets its .env files.
func (r *restoring) project(part contract.BackupPart, reader io.Reader) error {
	project, declared := r.projects[part.Name]
	if !declared {
		return protocol.NewError(contract.ErrorProjectNotFound, i18n.T("backup.restore.project", part.Name)).
			WithFix(i18n.T("backup.restore.project.fix"))
	}

	if part.Mode == contract.BackupProjectsEnv {
		if _, err := r.service.options.Reader.Pull(part.Name); err != nil {
			return err
		}

		if err := archive.Extract(reader, project.Path, r.owner); err != nil {
			return err
		}

		r.brought = append(r.brought, part.Name)

		return nil
	}

	parent := filepath.Dir(project.Path)
	if err := makeDirs(parent, r.owner); err != nil {
		return err
	}

	staged, err := archive.Staging(parent, part.Name, r.owner)
	if err != nil {
		return err
	}
	defer os.RemoveAll(staged)

	if err := archive.Extract(reader, staged, r.owner); err != nil {
		return err
	}

	if err := archive.Swap(staged, project.Path); err != nil {
		return err
	}

	r.brought = append(r.brought, part.Name)

	return nil
}

// leftOut is what a fresh server makes of what the settings kept out of the backup; a server taken back to it keeps its own.
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

// makeDirs makes a folder and whatever it needed, from the nearest one that exists, each given to owner.
func makeDirs(dir string, owner archive.Owner) error {
	base := dir
	for {
		if _, err := os.Stat(base); err == nil {
			break
		}

		parent := filepath.Dir(base)
		if parent == base {
			break
		}

		base = parent
	}

	if base == dir {
		return nil
	}

	return archive.MakeDirs(base, dir, owner)
}

// settle gives the restored registry what project.add gives a new row, then starts what ran.
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

// start brings up what the backup recorded as running, and the projects that start with the server anyway.
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

// after runs one step of the settling; a failure is a warning with its replay, and the next step runs all the same.
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

// replayOf is the request that runs a step again, as the app sends it: a restore has no command on the machine, since its key never lands there.
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
