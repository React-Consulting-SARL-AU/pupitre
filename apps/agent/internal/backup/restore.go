package backup

import (
	"errors"
	"io/fs"
	"path"
	"slices"

	"pupitre.studio/agent/internal/backup/archive"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/state"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

const beforeFolder = "before"

// RestoreSetup lays a backup's configuration down, migrated to this binary's revision; an installed machine only takes it with revert.
func (s *Service) RestoreSetup(sink modules.Sink, location contract.BackupLocation, secrets contract.BackupSecrets, revert bool) (contract.BackupRestoreSetupResult, error) {
	var result contract.BackupRestoreSetupResult

	err := s.options.Engine.Command(module.ID, sink, func(ctx *modules.Context) error {
		restored, err := s.restoreSetup(ctx, location, secrets, revert)
		result = restored

		return err
	})

	return result, err
}

func (s *Service) restoreSetup(ctx *modules.Context, location contract.BackupLocation, secrets contract.BackupSecrets, revert bool) (contract.BackupRestoreSetupResult, error) {
	marker, restoring := s.marker(ctx)
	before, _ := modules.Remembered(ctx.Sys(), s.options.Engine.InstallPath)

	if len(before.Modules) > 0 && !revert && !restoring {
		return contract.BackupRestoreSetupResult{}, protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.restore.installed")).
			WithFix(i18n.T("backup.restore.installed.fix"))
	}

	backup, err := s.open(ctx, location, secrets)
	if err != nil {
		return contract.BackupRestoreSetupResult{}, err
	}

	runner := s.migrator()
	if backup.manifest.Server.ConfigRevision > runner.Expected() {
		return contract.BackupRestoreSetupResult{}, ahead(backup.manifest.Server.ConfigRevision, runner.Expected())
	}

	private, err := backup.identity(secrets)
	if err != nil {
		return contract.BackupRestoreSetupResult{}, err
	}
	defer clear(private)

	files, err := s.setupOf(backup, private)
	if err != nil {
		return contract.BackupRestoreSetupResult{}, err
	}

	var warnings []string
	if revert {
		warnings = append(warnings, s.stopAll(ctx)...)
	}

	previous := projectNames(s.options.Reader)
	earlier := marker

	// A second restore before the install keeps what the machine held before the first.
	if !restoring {
		kept, err := s.keepBefore(ctx)
		if err != nil {
			return contract.BackupRestoreSetupResult{}, err
		}

		marker = Marker{StartedAt: stamp(s.now()), Before: kept}
	}

	marker.ID = backup.manifest.ID
	marker.Location = contract.BackupLocation{Endpoint: location.Endpoint, Region: location.Region, Bucket: location.Bucket, Key: backup.key, PathStyle: location.PathStyle, SHA256: location.SHA256}
	marker.Revert = marker.Revert || revert

	// The marker lands before the backup's files: a restore cut short in between is still one, and the next never takes its files for the machine's own.
	marker.Installed = ""
	if err := writeJSON(ctx, s.paths.Marker, marker); err != nil {
		return contract.BackupRestoreSetupResult{}, err
	}

	if err := s.putSetup(ctx, files, runner); err != nil {
		s.putBack(ctx, marker)
		s.forgetAttempt(ctx, earlier, restoring)

		return contract.BackupRestoreSetupResult{}, err
	}

	marker.Installed = s.installDigest(ctx)
	if err := writeJSON(ctx, s.paths.Marker, marker); err != nil {
		return contract.BackupRestoreSetupResult{}, err
	}

	after, err := modules.Remembered(ctx.Sys(), s.options.Engine.InstallPath)
	if err != nil {
		return contract.BackupRestoreSetupResult{}, err
	}

	projects := projectNames(s.options.Reader)

	return contract.BackupRestoreSetupResult{
		ID:       backup.manifest.ID,
		Modules:  orEmpty(after.Modules),
		Defer:    orEmpty(after.Defer),
		Extra:    orEmpty(without(before.Modules, after.Modules)),
		Projects: projects,
		Dropped:  orEmpty(without(previous, projects)),
		Parts:    dataParts(backup.manifest.Parts),
		Warnings: append(orEmpty(backup.manifest.Warnings), warnings...),
	}, nil
}

// The restore holds the run lock already: the configuration it lays down is migrated under it, not under a second one it would wait for.
func (s *Service) migrator() *migrate.Runner {
	options := s.options.Migrate
	options.Paths.Lock = ""

	return migrate.New(options)
}

func ahead(revision, expected int) error {
	return protocol.NewError(contract.ErrorBackupUnsupported, i18n.T("backup.unsupported.revision", revision, expected)).
		WithFix(i18n.T("backup.unsupported.fix"))
}

func (s *Service) setupOf(backup opened, private []byte) (map[string][]byte, error) {
	index := slices.IndexFunc(backup.manifest.Parts, func(part contract.BackupPart) bool { return part.Kind == contract.BackupPartSetup })
	if index < 0 {
		return nil, corrupt(i18n.T("backup.corrupt.setup"))
	}

	staged, err := s.part(backup, backup.manifest.Parts[index], private)
	if err != nil {
		return nil, err
	}
	defer staged.Close()

	reader, err := staged.open()
	if err != nil {
		return nil, err
	}

	files, err := archive.ReadFiles(reader, setupLimit)
	if err != nil {
		return nil, corrupt(i18n.T("backup.corrupt.part", backup.manifest.Parts[index].Key, err.Error()))
	}

	return files, nil
}

// Nothing of a project the backup does not know is deleted: it leaves the registry, its folder stays where it is.
func (s *Service) stopAll(ctx *modules.Context) []string {
	if _, err := s.options.Reader.Down(state.All, ""); err != nil {
		ctx.Logf("projects not all stopped: %s", err)

		return []string{i18n.T("backup.restore.stop", describe(err))}
	}

	return nil
}

// keepBefore copies aside the configuration the machine holds now, and names what it held: an abort before the install puts it back.
func (s *Service) keepBefore(ctx *modules.Context) ([]string, error) {
	if err := ctx.Sys().RemoveIn(s.paths.Staging, beforeFolder, true); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return nil, err
	}

	kept := []string{}

	for _, entry := range s.paths.Setup {
		content, err := ctx.Sys().ReadFile(entry.Path)
		if errors.Is(err, fs.ErrNotExist) {
			continue
		}
		if err != nil {
			return nil, err
		}

		if err := lay(ctx, s.beforePath(entry.Name), content); err != nil {
			return nil, err
		}

		kept = append(kept, entry.Name)
	}

	return kept, nil
}

func (s *Service) beforePath(name string) string {
	return path.Join(s.paths.Staging, beforeFolder, name)
}

// Configuration is root's alone, like everything under /etc/pupitre.
func lay(ctx sys.Context, target string, content []byte) error {
	if err := ctx.Sys().MkdirAll(path.Dir(target), 0o700); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, target, content, 0o600)
}

// putSetup lays the backup's files where this machine keeps them — a file the backup does not hold goes — then migrates them to this binary's revision.
func (s *Service) putSetup(ctx *modules.Context, files map[string][]byte, runner *migrate.Runner) error {
	for _, entry := range s.paths.Setup {
		content, held := files[entry.Name]
		if !held {
			if _, err := file.Remove(ctx, entry.Path); err != nil {
				return err
			}

			continue
		}

		if err := lay(ctx, entry.Path, content); err != nil {
			return err
		}
	}

	result, err := runner.Run()
	if err != nil {
		return err
	}

	switch {
	case result.State == contract.ConfigAhead:
		return ahead(result.Revision, result.Expected)
	case result.Failure != nil:
		return protocol.NewError(contract.ErrorMigrationRequired, i18n.T("backup.restore.migration", result.Failure.ID, result.Failure.Message)).
			WithFix(i18n.T("backup.restore.migration.fix"))
	case result.State != contract.ConfigCurrent:
		return protocol.NewError(contract.ErrorMigrationRequired, i18n.T("backup.restore.migration.pending")).
			WithFix(i18n.T("backup.restore.migration.fix"))
	}

	return nil
}

// putBack lays the configuration of before the restore back where it was, and removes what it did not hold.
func (s *Service) putBack(ctx sys.Context, marker Marker) {
	for _, entry := range s.paths.Setup {
		if !slices.Contains(marker.Before, entry.Name) {
			if _, err := file.Remove(ctx, entry.Path); err != nil {
				ctx.Logf("%s not removed: %s", entry.Path, err)
			}

			continue
		}

		content, err := ctx.Sys().ReadFile(s.beforePath(entry.Name))
		if err == nil {
			err = lay(ctx, entry.Path, content)
		}
		if err != nil {
			ctx.Logf("%s not put back: %s", entry.Path, err)
		}
	}
}

func (s *Service) installDigest(ctx sys.Context) string {
	content, err := ctx.Sys().ReadFile(s.options.Engine.InstallPath)
	if err != nil {
		return ""
	}

	return sha256Hex(content)
}

// forgetAttempt leaves the marker as a setup that failed found it: the one of an earlier restore, or none.
func (s *Service) forgetAttempt(ctx sys.Context, earlier Marker, restoring bool) {
	var err error
	if restoring {
		err = writeJSON(ctx, s.paths.Marker, earlier)
	} else {
		err = s.clearMarker(ctx)
	}

	if err != nil {
		ctx.Logf("restore marker not put back: %s", err)
	}
}

// Abort puts back the configuration of before the restore, unless an install has run on the restored one since.
// A marker without a digest is a setup cut short before it finished: whatever it laid down goes.
func (s *Service) Abort() error {
	return s.options.Engine.Command(module.ID, nil, func(ctx *modules.Context) error {
		marker, restoring := s.marker(ctx)
		if !restoring {
			return nil
		}

		if marker.Installed == "" || s.installDigest(ctx) == marker.Installed {
			s.putBack(ctx, marker)
		}

		return s.clearMarker(ctx)
	})
}

func (s *Service) clearMarker(ctx sys.Context) error {
	if err := ctx.Sys().RemoveIn(s.paths.Staging, beforeFolder, true); err != nil && !errors.Is(err, fs.ErrNotExist) {
		return err
	}

	_, err := file.Remove(ctx, s.paths.Marker)

	return err
}

func projectNames(reader *state.Reader) []string {
	names := []string{}

	declared, err := reader.Declared()
	if err != nil {
		return names
	}

	for _, project := range declared {
		names = append(names, project.Name)
	}

	return names
}

func dataParts(parts []contract.BackupPart) []contract.BackupPart {
	data := []contract.BackupPart{}

	for _, part := range parts {
		if part.Kind != contract.BackupPartSetup {
			data = append(data, part)
		}
	}

	return data
}
