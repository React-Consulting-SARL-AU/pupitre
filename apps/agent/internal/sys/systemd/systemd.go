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

// EnableLater wires a unit for the next boot without running it now: what a oneshot of the boot does has already happened, or has nothing to do yet.
func EnableLater(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("enable", unit))

	return err
}

func Disable(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("disable", "--now", unit))

	return err
}

func Start(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("start", unit))

	return err
}

func Stop(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, started("stop", unit))

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

// Recent is the unit's own last words, as many as asked for, from its current
// run alone: a daemon restarted on new credentials would otherwise be judged
// on what it said of the old ones. A daemon that retries drowns the one line
// that says why in the ones that say it again, so what reads a verdict asks
// for a window wide enough to hold a whole cycle.
func Recent(ctx sys.Context, unit string, lines int) string {
	scope := []string{"-u", unit}
	if id := invocation(ctx, unit); id != "" {
		scope = []string{"_SYSTEMD_INVOCATION_ID=" + id}
	}

	out, err := ctx.Sys().Run(sys.Command{
		Argv:    append([]string{"journalctl", "-n", strconv.Itoa(lines), "--no-pager", "-o", "cat"}, scope...),
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

// Journal is the unit's last lines, every run included, as the reader of a service page asks for them.
func Journal(ctx sys.Context, unit string, lines int) ([]string, error) {
	out, err := ctx.Sys().Run(sys.Command{Argv: journalctl(unit, lines), Timeout: diagnoseTimeout})
	if err != nil {
		return nil, err
	}

	return split(out.Stdout), nil
}

// Follow hands the tail over, then every line the unit writes until limit has passed: the stream ends on its own, never with an error for having ended.
func Follow(ctx sys.Context, unit string, lines int, limit time.Duration, emit func(string)) error {
	return ctx.Sys().Stream(sys.Command{Argv: append(journalctl(unit, lines), "-f"), Timeout: limit}, emit)
}

func journalctl(unit string, lines int) []string {
	return []string{"journalctl", "-u", unit, "-n", strconv.Itoa(lines), "--no-pager", "-o", "cat"}
}

func split(text string) []string {
	lines := []string{}
	for _, line := range strings.Split(strings.TrimRight(text, "\n"), "\n") {
		if line != "" {
			lines = append(lines, line)
		}
	}

	return lines
}

// invocation is the identifier systemd gave the unit's current run, empty for a unit that never ran.
func invocation(ctx sys.Context, unit string) string {
	out, err := ctx.Sys().Run(systemctl("show", "-p", "InvocationID", "--value", unit))
	if err != nil {
		return ""
	}

	return strings.TrimSpace(out.Stdout)
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
