package backup

import (
	"compress/gzip"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"os"
	"runtime"
	"time"

	"pupitre.studio/agent/internal/backup/seal"
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/migrate"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/s3"
)

const idStamp = "20060102T150405Z"

type Overrides struct {
	Name      string
	Databases *bool
	Projects  string
}

func (o Overrides) databases(settings module.Settings) bool {
	if o.Databases != nil {
		return *o.Databases
	}

	return settings.Databases
}

func (o Overrides) projects(settings module.Settings) string {
	if o.Projects != "" {
		return o.Projects
	}

	return settings.Projects
}

type job struct {
	service   *Service
	ctx       *modules.Context
	settings  module.Settings
	client    s3.Client
	server    string
	id        string
	key       string
	recipient []byte
	previous  *Last
	taken     map[string]bool
	parts     []contract.BackupPart
	warnings  []string
	excluded  contract.BackupExcluded
}

type source struct {
	step        string
	part        contract.BackupPart
	fingerprint string
	produce     func(w io.Writer) error
}

// sink may be nil when nobody watches.
func (s *Service) Run(sink modules.Sink, trigger string, overrides Overrides) (contract.BackupRunResult, error) {
	var result contract.BackupRunResult

	err := s.options.Engine.Command(module.ID, sink, func(ctx *modules.Context) error {
		made, err := s.run(ctx, trigger, overrides)
		result = made

		return err
	})

	return result, err
}

func (s *Service) run(ctx *modules.Context, trigger string, overrides Overrides) (contract.BackupRunResult, error) {
	settings := module.Read(ctx)
	if !settings.Configured() {
		return contract.BackupRunResult{}, unconfigured()
	}

	started := s.now()

	serverID := s.ServerID()
	if serverID == "" {
		return contract.BackupRunResult{}, s.unstarted(ctx, started, unnamed())
	}

	recipient, err := seal.DecodeKey(settings.Recipient)
	if err != nil {
		return contract.BackupRunResult{}, s.unstarted(ctx, started, unconfigured())
	}

	ctx.Replaying(replayRun)

	s.running.Add(1)
	defer s.running.Add(-1)

	record := s.record(ctx)
	record.RunningSince = stamp(started)
	record.RunningPID = os.Getpid()

	if err := s.keep(ctx, record); err != nil {
		return contract.BackupRunResult{}, err
	}

	id := newID(started)

	j := &job{
		service:   s,
		ctx:       ctx,
		settings:  settings,
		client:    s.bucket(settings.Client()),
		server:    serverID,
		id:        id,
		key:       settings.ServerPrefix(serverID) + id,
		recipient: recipient,
		previous:  record.Last,
		taken:     map[string]bool{},
		excluded:  contract.BackupExcluded{Projects: []string{}, Databases: []string{}},
	}

	made, err := j.make(trigger, overrides, started)

	record.RunningSince = ""
	record.RunningPID = 0
	record.LastRunAt = stamp(started)

	if err != nil {
		record.LastError = describe(err)

		if kept := s.keep(ctx, record); kept != nil {
			ctx.Logf("%s not written: %s", s.paths.State, kept)
		}

		return contract.BackupRunResult{}, err
	}

	record.LastOKAt = record.LastRunAt
	record.LastError = ""
	record.Last = &Last{
		ID:        made.result.ID,
		Key:       made.result.Key,
		Bytes:     made.result.Bytes,
		Recipient: settings.Recipient,
		Endpoint:  settings.Endpoint,
		Bucket:    settings.Bucket,
		Parts:     made.result.Parts,
		Warnings:  made.result.Warnings,
	}
	record = made.settle(record)

	if err := s.keep(ctx, record); err != nil {
		return contract.BackupRunResult{}, err
	}

	return made.result, nil
}

// Recorded so the schedule waits an interval after a failed start, not just the daemon's next turn.
func (s *Service) unstarted(ctx *modules.Context, started time.Time, err error) error {
	record := s.record(ctx)
	record.LastRunAt = stamp(started)
	record.LastError = describe(err)

	if kept := s.keep(ctx, record); kept != nil {
		ctx.Logf("%s not written: %s", s.paths.State, kept)
	}

	return err
}

type made struct {
	result  contract.BackupRunResult
	pending *contract.BackupDeclaration
	pruned  []string
	unknown []string
}

func (m made) settle(record Record) Record {
	if m.pending != nil {
		record.Pending = append(record.Pending, *m.pending)
	}

	record.Pending = withoutDeclarations(record.Pending, m.pruned)
	record.Forgotten = append(record.Forgotten, m.unknown...)

	return record
}

func (j *job) make(trigger string, overrides Overrides, started time.Time) (made, error) {
	if err := j.setup(); err != nil {
		return made{}, refused(err)
	}

	if j.settings.Home {
		j.home()
	}

	if overrides.databases(j.settings) {
		j.databases()
	} else {
		j.leaveOutDatabases()
	}

	j.projects(overrides.projects(j.settings))
	j.paths()

	manifest := j.manifest(trigger, overrides.Name, started)

	digest, bytes, err := j.writeManifest(manifest)
	if err != nil {
		return made{}, err
	}

	declaration := j.declaration(manifest, digest, bytes)
	declared := j.declare(declaration)

	pruned, unknown := j.prune(manifest.ID, started)

	result := made{
		result: contract.BackupRunResult{
			ID:       manifest.ID,
			Key:      j.key,
			Bytes:    declaration.Bytes,
			Parts:    manifest.Parts,
			Warnings: orEmpty(j.warnings),
			Declared: declared,
		},
		pruned:  pruned,
		unknown: unknown,
	}

	if !declared {
		result.pending = &declaration
	}

	return result, nil
}

// A failed part becomes a warning and the backup goes on without it; the caller still learns it failed.
func (j *job) carry(from source) error {
	var failure error

	err := j.ctx.Step(from.step, func() (modules.Outcome, error) {
		part, copied, err := j.send(from)
		if err != nil {
			failure = err

			return modules.Failed, errors.New(describe(err))
		}

		j.parts = append(j.parts, part)

		if copied {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
	if err != nil {
		j.warn(from.step, err)

		return failure
	}

	return nil
}

func (j *job) warn(step string, err error) {
	j.warnings = append(j.warnings, i18n.T("backup.part.failed", step, describe(err)))
}

func (j *job) send(from source) (contract.BackupPart, bool, error) {
	part := from.part
	part.Key = j.keyFor(part)
	part.Fingerprint = from.fingerprint

	if earlier, found := j.reusable(from); found {
		err := j.client.Copy(context.Background(), j.previous.Key+"/"+earlier.Key, j.key+"/"+part.Key, earlier.Bytes)
		if err == nil {
			part.Bytes, part.SHA256 = earlier.Bytes, earlier.SHA256

			return part, true, nil
		}

		j.ctx.Logf("%s: the copy of %s was refused (%s), sent again", from.step, earlier.Key, err)
	}

	uploaded, err := j.stream(part.Key, from.produce)
	if err != nil {
		return contract.BackupPart{}, false, err
	}

	part.Bytes, part.SHA256 = uploaded.Bytes, uploaded.SHA256

	return part, false, nil
}

func (j *job) reusable(from source) (contract.BackupPart, bool) {
	if from.fingerprint == "" || j.previous == nil {
		return contract.BackupPart{}, false
	}

	if j.previous.Recipient != j.settings.Recipient || j.previous.Endpoint != j.settings.Endpoint || j.previous.Bucket != j.settings.Bucket {
		return contract.BackupPart{}, false
	}

	for _, earlier := range j.previous.Parts {
		if stepOf(earlier) == from.step && earlier.Fingerprint == from.fingerprint {
			return earlier, true
		}
	}

	return contract.BackupPart{}, false
}

// No byte touches the server's disk; the producer's own failure is the one reported.
func (j *job) stream(key string, produce func(io.Writer) error) (s3.Uploaded, error) {
	reader, writer := io.Pipe()
	produced := make(chan error, 1)

	go func() {
		err := seals(writer, j.recipient, produce)
		writer.CloseWithError(err)
		produced <- err
	}()

	uploaded, err := j.client.Upload(context.Background(), j.key+"/"+key, reader)
	reader.CloseWithError(errUploadStopped)

	failure := <-produced
	if failure != nil && !errors.Is(failure, errUploadStopped) {
		return s3.Uploaded{}, failure
	}

	return uploaded, err
}

var errUploadStopped = errors.New("the upload stopped")

func seals(out io.Writer, recipient []byte, produce func(io.Writer) error) error {
	sealer, err := seal.NewWriter(out, recipient, seal.Options{})
	if err != nil {
		return err
	}

	zipped := gzip.NewWriter(sealer)

	if err := produce(zipped); err != nil {
		return err
	}

	if err := zipped.Close(); err != nil {
		return err
	}

	return sealer.Close()
}

func (j *job) manifest(trigger, name string, started time.Time) contract.BackupManifest {
	remembered, _ := modules.Remembered(j.ctx.Sys(), j.service.options.Engine.InstallPath)

	hostname, err := os.Hostname()
	if err != nil {
		hostname = ""
	}

	return contract.BackupManifest{
		Format:    contract.Backup.Format,
		ID:        j.id,
		CreatedAt: stamp(started),
		Trigger:   trigger,
		Name:      name,
		Server: contract.BackupServer{
			ID:             j.server,
			Hostname:       hostname,
			Arch:           runtime.GOARCH,
			AgentVersion:   j.service.options.AgentVersion,
			ConfigRevision: migrate.New(j.service.options.Migrate).State().Revision,
		},
		Recipient: j.settings.Recipient,
		KDF:       contract.BackupKDF{Alg: contract.Backup.KDF.Alg, Iterations: contract.Backup.KDF.Iterations, Salt: j.settings.Salt},
		Modules:   orEmpty(remembered.Modules),
		Running:   orEmpty(j.service.options.Reader.Wanted()),
		Parts:     j.parts,
		Warnings:  orEmpty(j.warnings),
		Excluded:  &j.excluded,
	}
}

// Written last, binding every part by digest: a prefix without a manifest is an upload that never finished.
func (j *job) writeManifest(manifest contract.BackupManifest) (string, int64, error) {
	var digest string
	var total int64
	var failure error

	err := j.ctx.Step("manifest", func() (modules.Outcome, error) {
		if err := contract.ValidateValue("BackupManifest", manifest); err != nil {
			failure = err

			return modules.Failed, err
		}

		encoded, err := encode(manifest)
		if err != nil {
			failure = err

			return modules.Failed, err
		}

		if err := j.client.Put(context.Background(), j.key+"/"+contract.BackupManifestKey, encoded, "application/json"); err != nil {
			failure = module.StorageRefused(err)

			return modules.Failed, errors.New(describe(err))
		}

		digest = sha256Hex(encoded)
		total = int64(len(encoded))

		for _, part := range manifest.Parts {
			total += part.Bytes
		}

		return modules.Done, nil
	})
	if err != nil {
		return "", 0, failure
	}

	return digest, total, nil
}

func (j *job) declaration(manifest contract.BackupManifest, digest string, bytes int64) contract.BackupDeclaration {
	return contract.BackupDeclaration{
		ID:             manifest.ID,
		CreatedAt:      manifest.CreatedAt,
		Trigger:        manifest.Trigger,
		Name:           manifest.Name,
		Bytes:          bytes,
		Counts:         contract.CountsOf(manifest.Parts),
		ConfigRevision: manifest.Server.ConfigRevision,
		AgentVersion:   manifest.Server.AgentVersion,
		Recipient:      manifest.Recipient,
		KDFSalt:        manifest.KDF.Salt,
		Location: contract.BackupLocation{
			Endpoint:  j.settings.Endpoint,
			Region:    j.settings.Region,
			Bucket:    j.settings.Bucket,
			Key:       j.key,
			PathStyle: j.settings.PathStyle,
			SHA256:    digest,
		},
	}
}

// An unreachable platform does not undo the backup: the daemon declares it again at its next turn.
func (j *job) declare(declaration contract.BackupDeclaration) bool {
	err := j.ctx.Step("declare", func() (modules.Outcome, error) {
		return modules.Done, j.service.declare(declaration)
	})

	return err == nil
}

func (s *Service) declare(declaration contract.BackupDeclaration) error {
	client, err := s.options.Platform()
	if err != nil {
		return err
	}

	ctx, cancel := context.WithTimeout(context.Background(), platformTimeout)
	defer cancel()

	return client.DeclareBackup(ctx, declaration)
}

const platformTimeout = 30 * time.Second

func newID(at time.Time) string {
	suffix := make([]byte, 3)
	rand.Read(suffix)

	return at.UTC().Format(idStamp) + "-" + hex.EncodeToString(suffix)
}

func stamp(at time.Time) string {
	return at.UTC().Format(time.RFC3339)
}

func orEmpty(values []string) []string {
	if values == nil {
		return []string{}
	}

	return values
}

func encode(manifest contract.BackupManifest) ([]byte, error) {
	encoded, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		return nil, err
	}

	return append(encoded, '\n'), nil
}

func refused(err error) error {
	var failure *s3.Error
	if errors.As(err, &failure) {
		return module.StorageRefused(err)
	}

	return err
}

func unconfigured() error {
	return protocol.NewError(contract.ErrorModuleNotFound, i18n.T("backup.unconfigured")).
		WithFix(i18n.T("backup.unconfigured.fix"))
}

func unnamed() error {
	return protocol.NewError(contract.ErrorBadRequest, i18n.T("backup.server_id.unknown")).
		WithFix(i18n.T("backup.server_id.unknown.fix"))
}

func describe(err error) string {
	var refusal *protocol.Error
	if errors.As(err, &refusal) {
		return refusal.Message
	}

	var step *modules.StepError
	if errors.As(err, &step) {
		return step.Message
	}

	var failure *s3.Error
	if errors.As(err, &failure) {
		message, _ := module.Refusal(err)

		return message
	}

	return err.Error()
}
