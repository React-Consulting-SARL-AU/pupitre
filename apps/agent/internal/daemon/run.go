package daemon

import (
	"context"
	"errors"
	"time"

	"pupitre.studio/agent/internal/platform"
)

// Thirty seconds for the state, five minutes for the heartbeat, and a failure never stops the loop: the platform coming back is exactly what the agent is waiting for.
func (d *Daemon) Run(ctx context.Context) error {
	states := time.NewTicker(d.options.StateInterval)
	defer states.Stop()

	beats := time.NewTicker(d.options.HeartbeatInterval)
	defer beats.Stop()

	d.journal.Logf("agent %s idling, platform read every %s", d.options.AgentVersion, d.options.StateInterval)

	d.syncOnce()
	d.beatOnce()

	for {
		select {
		case <-ctx.Done():
			d.journal.Logf("agent stopped")

			return nil
		case <-states.C:
			d.syncOnce()
		case <-beats.C:
			d.beatOnce()
		}
	}
}

func (d *Daemon) syncOnce() {
	synced, err := d.Sync()
	if err != nil {
		d.report("state", err)

		return
	}

	if synced.KeysChanged {
		d.journal.Logf("entitlement %s, target version %s", synced.Entitlement, orNone(synced.TargetVersion))
	}
}

func (d *Daemon) beatOnce() {
	if err := d.Beat(); err != nil {
		d.report("heartbeat", err)
	}
}

// An unenrolled server, a network down, a revoked token: three silences the journal tells apart, and none of them stops anything that runs.
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

// The same silence repeated every thirty seconds fills a journal for nothing: it is written once, and again when it changes.
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
		return "aucune"
	}

	return version
}
