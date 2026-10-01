package backup

import (
	"errors"
	"syscall"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/protocol"
)

const (
	hoursPerDay = 24
	maxBeatText = 500
)

// Daily-or-longer intervals land on the configured hour; a date already past is a missed backup, run once.
func Next(settings module.Settings, last, now time.Time, location *time.Location) time.Time {
	base := now

	if !last.IsZero() {
		base = last.Add(time.Duration(settings.IntervalHours) * time.Hour)
	}

	if settings.IntervalHours < hoursPerDay {
		return base
	}

	local := base.In(location)

	return time.Date(local.Year(), local.Month(), local.Day(), settings.Hour, 0, 0, 0, location)
}

// Never waits on the run lock: a backup under way reads as running.
func (s *Service) Status() (contract.BackupStatusResult, error) {
	var status contract.BackupStatusResult

	err := s.options.Engine.Inspect(module.ID, func(ctx *modules.Context) error {
		settings := module.Read(ctx)
		record := s.record(ctx)

		status = contract.BackupStatusResult{
			Configured:    settings.Configured(),
			IntervalHours: settings.IntervalHours,
			Keep:          settings.Keep,
			Running:       s.running.Load() > 0 || (record.RunningSince != "" && alive(record.RunningPID)),
			Last:          lastRun(record),
		}

		if status.Configured && settings.IntervalHours > 0 {
			status.NextRunAt = Next(settings, record.lastRun(), s.now(), s.options.Location).UTC().Format(time.RFC3339)
		}

		return nil
	})

	return status, err
}

func lastRun(record Record) *contract.BackupLastRun {
	if record.LastRunAt == "" {
		return nil
	}

	last := &contract.BackupLastRun{At: record.LastRunAt, OK: record.LastError == "" && record.LastOKAt == record.LastRunAt}

	if !last.OK {
		last.Error = record.LastError

		return last
	}

	if record.Last != nil {
		last.ID = record.Last.ID
		last.Bytes = record.Last.Bytes
		last.Warnings = record.Last.Warnings
	}

	return last
}

func lastWarnings(record Record) int {
	if record.Last == nil || record.LastOKAt != record.LastRunAt {
		return 0
	}

	return len(record.Last.Warnings)
}

// Probed without the run lock: an install asking for it in that instant would be told busy.
func alive(pid int) bool {
	if pid <= 0 {
		return false
	}

	err := syscall.Kill(pid, 0)

	return err == nil || errors.Is(err, syscall.EPERM)
}

func (s *Service) Beat() *contract.BackupBeat {
	var beat *contract.BackupBeat

	_ = s.options.Engine.Inspect(module.ID, func(ctx *modules.Context) error {
		settings := module.Read(ctx)
		if !settings.Configured() {
			return nil
		}

		record := s.record(ctx)

		beat = &contract.BackupBeat{
			IntervalHours: settings.IntervalHours,
			LastRunAt:     record.LastRunAt,
			LastOKAt:      record.LastOKAt,
			LastError:     cut(record.LastError, maxBeatText),
			LastWarnings:  lastWarnings(record),
		}

		return nil
	})

	return beat
}

// Runs apart from the daemon's loop, one at a time; a held lock or restricted mode just waits for a later turn.
func (s *Service) Turn() {
	if !s.turning.CompareAndSwap(false, true) {
		return
	}

	go func() {
		defer s.turning.Store(false)

		s.Tend()
	}()
}

func (s *Service) Tend() {
	s.tell()

	if !s.due() {
		return
	}

	if _, err := s.Run(nil, contract.BackupTriggerSchedule, Overrides{}); err != nil && !waiting(err) {
		s.log("scheduled backup failed: %s", err)
	}
}

func (s *Service) due() bool {
	due := false

	_ = s.options.Engine.Inspect(module.ID, func(ctx *modules.Context) error {
		settings := module.Read(ctx)
		if !settings.Configured() || settings.IntervalHours == 0 {
			return nil
		}

		now := s.now()
		due = !now.Before(Next(settings, s.record(ctx).lastRun(), now, s.options.Location))

		return nil
	})

	return due
}

func waiting(err error) bool {
	var refusal *protocol.Error
	if !errors.As(err, &refusal) {
		return false
	}

	return refusal.Code == contract.ErrorBusy || refusal.Code == contract.ErrorLicenseRequired
}

func (s *Service) log(format string, args ...any) {
	_ = s.options.Engine.Inspect(module.ID, func(ctx *modules.Context) error {
		ctx.Logf(format, args...)

		return nil
	})
}

func cut(text string, limit int) string {
	runes := []rune(text)
	if len(runes) <= limit {
		return text
	}

	return string(runes[:limit-1]) + "…"
}
