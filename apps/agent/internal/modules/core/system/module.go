package system

import (
	"slices"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/daemon"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	User        = "dev"
	Home        = "/home/dev"
	ProjectsDir = Home + "/projects"
	Shell       = user.Shell

	sudoersPath        = sudo.Path
	sysctlPath         = "/etc/sysctl.d/99-pupitre.conf"
	aptPeriodicPath    = "/etc/apt/apt.conf.d/52pupitre"
	timezonePath       = "/etc/timezone"
	swapPath           = "/swapfile"
	fstabPath          = "/etc/fstab"
	fstabLine          = swapPath + " none swap sw 0 0"
	passwdPath         = "/etc/passwd"
	osReleasePath      = "/etc/os-release"
	zshrcPath          = Home + "/.zshrc"
	bashrcPath         = Home + "/.bashrc"
	tmuxPath           = Home + "/.tmux.conf"
	gitconfigPath      = Home + "/.gitconfig"
	sshDir             = Home + "/.ssh"
	configDir          = Home + "/.config"
	localDir           = Home + "/.local"
	localBinDir        = localDir + "/bin"
	localShareDir      = localDir + "/share"
	authorizedKeysPath = sshDir + "/authorized_keys"
	rootKeysPath       = "/root/.ssh/authorized_keys"
)

var Packages = []string{
	"ca-certificates", "curl", "jq", "git", "tmux", "zsh", "unzip", "rsync",
	"build-essential", "ufw", "fail2ban", "unattended-upgrades",
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

// The machine's own answers: a directory that is a file holds no project, and a zone this kernel never heard of leaves the clock wrong.
func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(
		modules.TimezoneUnknown(ctx, "timezone"),
		modules.DirectoryOccupied(ctx, "projects_dir"),
	)
}

// The dev user is what the first install leaves and nothing takes away; a
// package added to the list since is what the next upgrade brings, and must not
// read as a machine never installed — or that upgrade would never reach it.
func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !user.Exists(ctx, User) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: sudoGranted(ctx) && file.HasBlock(ctx, zshrcPath, ID) && file.HasBlock(ctx, bashrcPath, ID) && linked(ctx) && file.Same(ctx, daemon.UnitPath, []byte(daemon.UnitFile)),
		Version:    osVersion(ctx),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return sequence(ctx, repairDpkg, installPackages, createSwap, enableMemoryGuard, configureUnattendedUpgrades, enableUnattendedUpgrades, raiseSystemLimits)
}

func (Module) Configure(ctx *modules.Context) error {
	return sequence(ctx, setTimezone, createUser, grantSudo, prepareHome, seedAuthorizedKeys, createProjectsDir, setGitIdentity, writeZshrc, writeBashrc, writeTmuxConf, linkDev, installAgentUnit, installResumeUnit)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := installPackages(ctx); err != nil {
		return err
	}

	if err := ctx.Step("upgrade-packages", func() (modules.Outcome, error) {
		before, err := versions(ctx)
		if err != nil {
			return modules.Failed, err
		}

		// apt-get install takes an installed package to its candidate: one call for the whole list.
		if err := apt.Install(ctx, Packages...); err != nil {
			return modules.Failed, err
		}

		after, err := versions(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if slices.Equal(before, after) {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

func versions(ctx *modules.Context) ([]string, error) {
	held := make([]string, 0, len(Packages))
	for _, pkg := range Packages {
		version, err := apt.Version(ctx, pkg)
		if err != nil {
			return nil, err
		}

		held = append(held, version)
	}

	return held, nil
}

// The dev user, the packages, the swap and the memory guard stay: they hold the client's work and keep the machine healthy.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := removeFile(ctx, "revoke-sudo", sudoersPath); err != nil {
		return err
	}

	if err := removeFile(ctx, "remove-system-limits", sysctlPath); err != nil {
		return err
	}

	if err := removeFile(ctx, "remove-unattended-upgrades-config", aptPeriodicPath); err != nil {
		return err
	}

	if err := removeBlock(ctx, "remove-zshrc-block", zshrcPath); err != nil {
		return err
	}

	if err := removeBlock(ctx, "remove-bashrc-block", bashrcPath); err != nil {
		return err
	}

	if err := unlinkDev(ctx); err != nil {
		return err
	}

	if err := removeResumeUnit(ctx); err != nil {
		return err
	}

	if err := removeAgentUnit(ctx); err != nil {
		return err
	}

	return removeBlock(ctx, "remove-git-identity", gitconfigPath)
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = contract.ServiceUnknown
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	return status, nil
}

func sequence(ctx *modules.Context, steps ...func(*modules.Context) error) error {
	for _, step := range steps {
		if err := step(ctx); err != nil {
			return err
		}
	}

	return nil
}

func removeFile(ctx *modules.Context, step, path string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, path)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func removeBlock(ctx *modules.Context, step, path string) error {
	return ctx.Step(step, func() (modules.Outcome, error) {
		removed, err := file.RemoveBlock(ctx, path, ID)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func osVersion(ctx *modules.Context) string {
	raw, err := file.Read(ctx, osReleasePath)
	if err != nil {
		return ""
	}

	for _, line := range strings.Split(string(raw), "\n") {
		if value, ok := strings.CutPrefix(line, "PRETTY_NAME="); ok {
			return strings.Trim(value, `"`)
		}
	}

	return ""
}
