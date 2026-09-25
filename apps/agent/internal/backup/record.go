package backup

import (
	"encoding/json"
	"path/filepath"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/file"
)

type Record struct {
	RunningSince string `json:"running_since,omitempty"`
	// A dead PID means the process crashed and left RunningSince behind.
	RunningPID int                          `json:"running_pid,omitempty"`
	LastRunAt  string                       `json:"last_run_at,omitempty"`
	LastOKAt   string                       `json:"last_ok_at,omitempty"`
	LastError  string                       `json:"last_error,omitempty"`
	Last       *Last                        `json:"last,omitempty"`
	Pending    []contract.BackupDeclaration `json:"pending_declarations"`
	// Pruned from the bucket, but the platform still holds their reference.
	Forgotten []string `json:"pending_forgets,omitempty"`
}

// What the next backup copies inside the bucket when a part has not changed.
type Last struct {
	ID        string                `json:"id"`
	Key       string                `json:"key"`
	Bytes     int64                 `json:"bytes"`
	Recipient string                `json:"recipient"`
	Endpoint  string                `json:"endpoint"`
	Bucket    string                `json:"bucket"`
	Parts     []contract.BackupPart `json:"parts"`
	Warnings  []string              `json:"warnings,omitempty"`
}

// An unreadable record is an empty one: it only ever says what happened, never what may be done.
func (s *Service) record(ctx sys.Context) Record {
	raw, err := ctx.Sys().ReadFile(s.paths.State)
	if err != nil {
		return Record{}
	}

	var record Record

	if err := json.Unmarshal(raw, &record); err != nil {
		ctx.Logf("%s unreadable, taken as empty: %v", s.paths.State, err)

		return Record{}
	}

	return record
}

func (s *Service) keep(ctx sys.Context, record Record) error {
	if record.Pending == nil {
		record.Pending = []contract.BackupDeclaration{}
	}

	return writeJSON(ctx, s.paths.State, record)
}

func (r Record) lastRun() time.Time {
	at, err := time.Parse(time.RFC3339, r.LastRunAt)
	if err != nil {
		return time.Time{}
	}

	return at
}

type Marker struct {
	ID        string                  `json:"id"`
	Location  contract.BackupLocation `json:"location"`
	Revert    bool                    `json:"revert"`
	StartedAt string                  `json:"started_at"`
	// install.json's digest as the restore left it: another means an install ran since, empty that setup never finished.
	Installed string `json:"installed"`
	// Config files held before the restore, copied under the staging folder.
	Before []string `json:"before"`
}

func (s *Service) marker(ctx sys.Context) (Marker, bool) {
	raw, err := ctx.Sys().ReadFile(s.paths.Marker)
	if err != nil {
		return Marker{}, false
	}

	var marker Marker

	if err := json.Unmarshal(raw, &marker); err != nil {
		return Marker{}, false
	}

	return marker, true
}

func writeJSON(ctx sys.Context, path string, value any) error {
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}

	if err := ctx.Sys().MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}

	return file.WriteAtomic(ctx, path, append(encoded, '\n'), 0o600)
}
