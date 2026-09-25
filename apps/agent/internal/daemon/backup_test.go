package daemon_test

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/entitlement"
	"pupitre.studio/agent/internal/platform"
)

type backups struct {
	turns atomic.Int32
	beat  *contract.BackupBeat
}

func (b *backups) Turn() {
	b.turns.Add(1)
}

func (b *backups) Beat() *contract.BackupBeat {
	return b.beat
}

func TestTheServerIDThePlatformNamesIsKept(t *testing.T) {
	b := newBench(t, true)
	b.platform.serverID = "cq1w2e3r4t5y6u7i8o9p0a1s2"

	if _, err := b.agent().Sync(context.Background()); err != nil {
		t.Fatal(err)
	}

	if platform.LoadServerID(b.fake, "") != "cq1w2e3r4t5y6u7i8o9p0a1s2" {
		t.Fatalf("server.id = %q", b.fake.Files[platform.DefaultServerIDPath])
	}
}

func TestTheHeartbeatSaysWhereTheBackupsStand(t *testing.T) {
	b := newBench(t, true)
	options := b.options()
	options.Backups = &backups{beat: &contract.BackupBeat{IntervalHours: 24, LastOKAt: "2026-09-24T03:00:00Z"}}

	if err := daemon.New(options).Beat(context.Background()); err != nil {
		t.Fatal(err)
	}

	beat := b.platform.beats[0]
	if beat.Backup == nil || beat.Backup.IntervalHours != 24 || beat.Backup.LastOKAt == "" {
		t.Fatalf("beat = %+v", beat.Backup)
	}

	if err := b.agent().Beat(context.Background()); err != nil || b.platform.beats[1].Backup != nil {
		t.Fatal("a server without backups says nothing of them")
	}
}

func TestEveryTurnOfTheLoopGivesTheBackupsTheirTurn(t *testing.T) {
	b := newBench(t, true)
	scheduled := &backups{}

	agent := daemon.New(daemon.Options{
		Sys:               b.fake,
		Now:               func() time.Time { return b.now },
		Platform:          platform.Client{BaseURL: b.server.URL},
		Entitlement:       entitlement.New(entitlement.Options{Sys: b.fake, Now: func() time.Time { return b.now }}),
		AgentVersion:      "1.2.3",
		StateInterval:     time.Millisecond,
		HeartbeatInterval: time.Hour,
		Backups:           scheduled,
	})

	ctx, stop := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- agent.Run(ctx) }()

	deadline := time.Now().Add(5 * time.Second)
	for scheduled.turns.Load() < 3 && time.Now().Before(deadline) {
		time.Sleep(time.Millisecond)
	}

	stop()
	if err := <-done; err != nil || scheduled.turns.Load() < 3 {
		t.Fatalf("%d turn(s), %v", scheduled.turns.Load(), err)
	}
}
