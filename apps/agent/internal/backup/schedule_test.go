package backup_test

import (
	"os"
	"os/exec"
	"strconv"
	"syscall"
	"testing"
	"time"

	"pupitre.studio/agent/internal/backup"
	"pupitre.studio/agent/internal/contract"
	module "pupitre.studio/agent/internal/modules/core/backup"
	"pupitre.studio/agent/internal/s3/s3test"
)

func TestTheNextBackupFollowsTheLastAttemptAndLandsOnTheHour(t *testing.T) {
	paris, err := time.LoadLocation("Europe/Paris")
	if err != nil {
		t.Skip("no zone database on this machine")
	}

	at := func(value string) time.Time {
		parsed, err := time.ParseInLocation("2006-01-02 15:04", value, paris)
		if err != nil {
			t.Fatal(err)
		}

		return parsed
	}

	cases := []struct {
		name     string
		interval int
		last     string
		now      string
		want     string
	}{
		{"never ran, the hour is still ahead today", 24, "", "2026-09-24 01:00", "2026-09-24 03:00"},
		{"never ran, the hour is past: caught up now", 24, "", "2026-09-24 14:00", "2026-09-24 03:00"},
		{"a day after the last, on the hour", 24, "2026-09-24 03:00", "2026-09-24 14:00", "2026-09-25 03:00"},
		{"a manual backup at night moves the next one to the next night", 24, "2026-09-24 02:59", "2026-09-24 03:00", "2026-09-25 03:00"},
		{"two days", 48, "2026-09-24 03:10", "2026-09-24 14:00", "2026-09-26 03:00"},
		{"under a day, no hour", 6, "2026-09-24 03:10", "2026-09-24 04:00", "2026-09-24 09:10"},
		{"a restart after a long stop: due at once", 24, "2026-09-10 03:00", "2026-09-24 14:00", "2026-09-11 03:00"},
	}

	for _, tc := range cases {
		settings := module.Settings{IntervalHours: tc.interval, Hour: 3}

		var last time.Time
		if tc.last != "" {
			last = at(tc.last)
		}

		got := backup.Next(settings, last, at(tc.now), paris)
		if !got.Equal(at(tc.want)) {
			t.Errorf("%s: next %s, want %s", tc.name, got.In(paris), tc.want)
		}
	}
}

func TestADueBackupRunsOnTheDaemonsTurnAsAScheduledOne(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	b.service.Tend()

	if declared := b.platform.declarations(); len(declared) != 1 || declared[0].Trigger != contract.BackupTriggerSchedule {
		t.Fatal("a backup the daemon starts is a scheduled one")
	}

	status, err := b.service.Status()
	if err != nil || !status.Configured || status.Running || status.Last == nil || !status.Last.OK || status.NextRunAt != "2026-09-25T03:00:00Z" {
		t.Fatalf("status = %+v, %v", status, err)
	}

	beat := b.service.Beat()
	if beat == nil || beat.IntervalHours != 24 || beat.LastOKAt == "" || beat.LastError != "" {
		t.Fatalf("beat = %+v", beat)
	}

	if err := contract.ValidateValue("BackupStatusResult", status); err != nil {
		t.Fatal(err)
	}
}

func TestATurnWaitsWhileAnInstallHoldsTheLock(t *testing.T) {
	bucket := s3test.New(t, bucketName)
	b := newBench(t, bucket).configured()

	held, err := os.OpenFile(b.engine.LockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()

	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	_, err = b.service.Run(nil, contract.BackupTriggerSchedule, backup.Overrides{})
	if refusalCode(err) != contract.ErrorBusy {
		t.Fatalf("got %v, want busy", err)
	}

	status, _ := b.service.Status()
	if status.Last != nil {
		t.Fatal("a backup that waited for the lock is not an attempt")
	}
}

func deadPID(t *testing.T) int {
	t.Helper()

	gone := exec.Command("true")
	if err := gone.Run(); err != nil {
		t.Fatal(err)
	}

	return gone.Process.Pid
}

func TestABackupLeftRunningByAProcessThatDiedIsNotUnderWay(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()

	held, err := os.OpenFile(b.engine.LockPath, os.O_CREATE|os.O_RDWR, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer held.Close()

	if err := syscall.Flock(int(held.Fd()), syscall.LOCK_EX|syscall.LOCK_NB); err != nil {
		t.Fatal(err)
	}

	b.fake.Files["/var/lib/pupitre/backup.json"] = []byte(`{"running_since":"2026-09-24T02:00:00Z","running_pid":` + strconv.Itoa(deadPID(t)) + `,"pending_declarations":[]}`)

	status, err := b.service.Status()
	if err != nil || status.Running {
		t.Fatalf("an install holding the lock is not a backup, and a dead process runs nothing: %+v, %v", status, err)
	}

	b.fake.Files["/var/lib/pupitre/backup.json"] = []byte(`{"running_since":"2026-09-24T02:00:00Z","running_pid":` + strconv.Itoa(os.Getpid()) + `,"pending_declarations":[]}`)

	if status, _ := b.service.Status(); !status.Running {
		t.Fatal("a backup whose process runs is under way")
	}
}

func TestABackupThatCannotStartWaitsAnIntervalBeforeTheNextTry(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName)).configured()
	delete(b.fake.Files, serverIDPath)

	b.service.Tend()

	status, err := b.service.Status()
	if err != nil || status.Last == nil || status.Last.OK || status.Last.Error == "" {
		t.Fatalf("an attempt that could not start is one: %+v, %v", status, err)
	}

	if status.NextRunAt != "2026-09-25T03:00:00Z" {
		t.Fatalf("the next try is an interval away, not the daemon's next turn: %s", status.NextRunAt)
	}
}

func TestAServerWithoutTheModuleSaysNothingToTheHeartbeat(t *testing.T) {
	b := newBench(t, s3test.New(t, bucketName))

	if beat := b.service.Beat(); beat != nil {
		t.Fatalf("beat = %+v", beat)
	}

	status, err := b.service.Status()
	if err != nil || status.Configured || status.NextRunAt != "" {
		t.Fatalf("status = %+v, %v", status, err)
	}
}
