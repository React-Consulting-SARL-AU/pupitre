package system

import (
	"errors"
	"strings"

	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/host"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	memoryThresholdKB = 8 * 1024 * 1024
	smallSwap         = "2G"
	largeSwap         = "4G"
)

var aptTimers = []string{"apt-daily.timer", "apt-daily-upgrade.timer"}

// A fresh machine often leaves dpkg half-configured after its first unattended upgrade; until repaired, every apt-get fails.
func repairDpkg(ctx *modules.Context) error {
	return ctx.Step("repair-dpkg", func() (modules.Outcome, error) {
		out, err := ctx.Sys().Run(sys.Command{Argv: []string{"dpkg", "--audit"}})
		if err == nil && strings.TrimSpace(out.Stdout) == "" {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Fix(ctx)
	})
}

func installPackages(ctx *modules.Context) error {
	return ctx.Step("install-packages", func() (modules.Outcome, error) {
		missing := apt.Missing(ctx, Packages...)
		if len(missing) == 0 {
			return modules.Skipped, nil
		}

		if err := apt.Install(ctx, missing...); err == nil {
			return modules.Done, nil
		}

		var failed []string
		for _, pkg := range missing {
			if err := apt.Install(ctx, pkg); err != nil {
				ctx.Logf("%s : %v", pkg, err)
				failed = append(failed, pkg)
			}
		}

		if len(failed) > 0 {
			return modules.Failed, errors.New(i18n.T("modules.system.packages_refused", strings.Join(failed, ", ")))
		}

		return modules.Done, nil
	})
}

// A swap file half made — allocated but never formatted or enabled — is removed on the spot: left there, every replay would take it for a swap and skip it for ever.
func createSwap(ctx *modules.Context) error {
	return ctx.Step("create-swap", func() (modules.Outcome, error) {
		if swapPresent(ctx) {
			return modules.Skipped, nil
		}

		size := swapSize(ctx)
		for _, argv := range [][]string{
			{"fallocate", "-l", size, swapPath},
			{"chmod", "600", swapPath},
			{"mkswap", swapPath},
			{"swapon", swapPath},
		} {
			if _, err := sys.Exec(ctx, sys.Command{Argv: argv}); err != nil {
				_, _ = file.Remove(ctx, swapPath)
				ctx.Warn(i18n.T("warn.system.swap.failed", err.Error()))

				return modules.Done, nil
			}
		}

		_, err := file.EnsureLine(ctx, fstabPath, fstabLine)

		return modules.Done, err
	})
}

// A swap is present when the kernel uses one or fstab enables ours at boot; a bare file at the path proves nothing.
func swapPresent(ctx *modules.Context) bool {
	if raw, err := file.Read(ctx, "/proc/swaps"); err == nil && len(strings.Split(strings.TrimSpace(string(raw)), "\n")) > 1 {
		return true
	}

	raw, err := file.Read(ctx, fstabPath)

	return err == nil && strings.Contains(string(raw), fstabLine)
}

func swapSize(ctx *modules.Context) string {
	if kb, known := host.MemTotalKB(ctx); known && kb >= memoryThresholdKB {
		return largeSwap
	}

	return smallSwap
}

func enableMemoryGuard(ctx *modules.Context) error {
	return ctx.Step("enable-memory-guard", func() (modules.Outcome, error) {
		if systemd.Active(ctx, "systemd-oomd") || systemd.Active(ctx, "earlyoom") {
			return modules.Skipped, nil
		}

		if apt.Installed(ctx, "systemd-oomd") {
			return modules.Done, systemd.Enable(ctx, "systemd-oomd")
		}

		if !apt.Installed(ctx, "earlyoom") {
			if err := apt.Install(ctx, "earlyoom"); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, systemd.Enable(ctx, "earlyoom")
	})
}

func configureUnattendedUpgrades(ctx *modules.Context) error {
	return writeIfChanged(ctx, "configure-unattended-upgrades", aptPeriodicPath, []byte(aptPeriodic), 0o644)
}

// A step of Configure, which every upgrade replays: a server installed before the drop-in gets it on its next upgrade.
func rotateAgentLog(ctx *modules.Context) error {
	return writeIfChanged(ctx, "rotate-agent-log", logRotationPath, []byte(agentLogRotation), 0o644)
}

func enableUnattendedUpgrades(ctx *modules.Context) error {
	return ctx.Step("enable-unattended-upgrades", func() (modules.Outcome, error) {
		outcome := modules.Skipped
		for _, timer := range aptTimers {
			if systemd.Active(ctx, timer) {
				continue
			}

			if err := systemd.Enable(ctx, timer); err != nil {
				return modules.Failed, err
			}
			outcome = modules.Done
		}

		return outcome, nil
	})
}

func raiseSystemLimits(ctx *modules.Context) error {
	return ctx.Step("raise-system-limits", func() (modules.Outcome, error) {
		if file.Same(ctx, sysctlPath, []byte(sysctl)) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, sysctlPath, []byte(sysctl), 0o644); err != nil {
			return modules.Failed, err
		}

		_, err := sys.Exec(ctx, sys.Command{Argv: []string{"sysctl", "-q", "-p", sysctlPath}})

		return modules.Done, err
	})
}

func writeIfChanged(ctx *modules.Context, step, path string, content []byte, mode uint32) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		if file.Same(ctx, path, content) {
			return modules.Skipped, nil
		}

		return modules.Done, file.WriteAtomic(ctx, path, content, fsMode(mode))
	})
}
