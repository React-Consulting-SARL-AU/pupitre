package daemon

import (
	"context"
	"errors"
	"time"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/platform"
)

// A failure never stops the loop: the platform coming back is exactly what it waits for.
func (d *Daemon) Run(ctx context.Context) error {
	states := time.NewTicker(d.options.StateInterval)
	defer states.Stop()

	beats := time.NewTicker(d.options.HeartbeatInterval)
	defer beats.Stop()

	d.journal.Logf("agent %s idling, platform read every %s", d.options.AgentVersion, d.options.StateInterval)

	d.syncOnce(ctx)
	d.beatOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			d.journal.Logf("agent stopped")

			return nil
		case <-states.C:
			d.syncOnce(ctx)
			d.backupTurn()
		case <-beats.C:
			d.beatOnce(ctx)
		}
	}
}

func (d *Daemon) syncOnce(ctx context.Context) {
	synced, err := d.Sync(ctx)
	if err != nil {
		d.report("state", err)

		return
	}

	if synced.KeysChanged {
		d.journal.Logf("entitlement %s, target version %s", synced.Entitlement, orNone(synced.TargetVersion))
	}
}

func (d *Daemon) backupTurn() {
	if d.options.Backups != nil {
		d.options.Backups.Turn()
	}
}

func (d *Daemon) beatOnce(ctx context.Context) {
	if err := d.Beat(ctx); err != nil {
		d.report("heartbeat", err)
	}
}

func (d *Daemon) report(what string, err error) {
	if errors.Is(err, platform.ErrNoToken) {
		d.once(what, "this server is not enrolled")

		return
	}

	var failure *platform.Error
	if errors.As(err, &failure) && failure.Unauthorized() {
		d.once(what, "the platform refuses this server's token")

		return
	}

	d.once(what, err.Error())
}

// Logged only when it changes, or the same silence would fill the journal every thirty seconds.
func (d *Daemon) once(what, message string) {
	line := what + " : " + message
	if line == d.lastReport {
		return
	}

	d.lastReport = line
	d.journal.Logf("%s", line)
}

func orNone(version string) string {
	if version == "" {
		return i18n.T("daemon.version.none")
	}

	return version
}
