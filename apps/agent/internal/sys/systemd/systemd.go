package systemd

import (
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
)

const (
	unitDir = "/etc/systemd/system"

	diagnosedLines  = 12
	diagnoseTimeout = 30 * time.Second

	// Longer than the 90 s systemd itself allows a start, so the unit's own
	// verdict is what fails the step, not a clock that beat it to it.
	startTimeout = 3 * time.Minute
)

// A unit whose start systemd waits on — Type=notify — holds this command for
// as long as its own TimeoutStartSec. Past that, the wait is the agent's
// problem to end, with a reason, rather than the reader's to sit through.
func Enable(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("enable", "--now", unit))

	return err
}

func Disable(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("disable", "--now", unit))

	return err
}

func Restart(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("restart", unit))

	return err
}

func Reload(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("reload", unit))

	return err
}

// Diagnose is what the unit itself said, for a start that did not go through:
// systemctl only ever answers that the job failed, and the reason is in the
// unit's own journal.
func Diagnose(ctx sys.Context, unit string) string {
	return Recent(ctx, unit, diagnosedLines)
}

// Recent is the unit's own last words, as many as asked for. A daemon that
// retries drowns the one line that says why in the ones that say it again, so
// what reads a verdict asks for a window wide enough to hold a whole cycle.
func Recent(ctx sys.Context, unit string, lines int) string {
	out, err := ctx.Sys().Run(sys.Command{
		Argv:    []string{"journalctl", "-u", unit, "-n", strconv.Itoa(lines), "--no-pager", "-o", "cat"},
		Timeout: diagnoseTimeout,
	})
	if err != nil {
		return ""
	}

	var kept []string
	for _, line := range strings.Split(strings.TrimSpace(out.Stdout), "\n") {
		if trimmed := strings.TrimSpace(line); trimmed != "" {
			kept = append(kept, trimmed)
		}
	}

	return strings.Join(kept, " / ")
}

func Loaded(ctx sys.Context, unit string) bool {
	out, err := ctx.Sys().Run(systemctl("show", "-p", "LoadState", "--value", unit))

	return err == nil && strings.TrimSpace(out.Stdout) == "loaded"
}

func Active(ctx sys.Context, unit string) bool {
	out, err := ctx.Sys().Run(systemctl("is-active", unit))

	return err == nil && strings.TrimSpace(out.Stdout) == "active"
}

func State(ctx sys.Context, unit string) contract.ServiceState {
	out, _ := ctx.Sys().Run(systemctl("is-active", unit))

	switch strings.TrimSpace(out.Stdout) {
	case "active", "activating", "reloading":
		return contract.ServiceRunning
	case "inactive", "deactivating":
		return contract.ServiceStopped
	case "failed":
		return contract.ServiceFailed
	}

	return contract.ServiceUnknown
}

func WriteUnit(ctx sys.Context, name string, content []byte) error {
	path := unitDir + "/" + name + ".service"

	ctx.Logf("write %s", path)
	if err := ctx.Sys().WriteFile(path, content, 0o644); err != nil {
		return err
	}

	_, err := sys.Exec(ctx, systemctl("daemon-reload"))

	return err
}

func systemctl(args ...string) sys.Command {
	return sys.Command{Argv: append([]string{"systemctl"}, args...)}
}

func started(args ...string) sys.Command {
	command := systemctl(args...)
	command.Timeout = startTimeout

	return command
}
