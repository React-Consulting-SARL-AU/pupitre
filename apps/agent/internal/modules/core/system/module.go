package system

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	User        = "dev"
	Home        = "/home/dev"
	ProjectsDir = Home + "/projects"
	Shell       = "/usr/bin/zsh"

	sudoersPath        = "/etc/sudoers.d/90-dev"
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
	authorizedKeysPath = sshDir + "/authorized_keys"
	rootKeysPath       = "/root/.ssh/authorized_keys"
)

var Packages = []string{
	"ca-certificates", "curl", "jq", "git", "tmux", "zsh", "unzip",
	"build-essential", "ufw", "fail2ban", "unattended-upgrades",
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if len(apt.Missing(ctx, Packages...)) > 0 || !user.Exists(ctx, User) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: file.Same(ctx, sudoersPath, []byte(sudoers)) && file.HasBlock(ctx, zshrcPath, ID) && file.HasBlock(ctx, bashrcPath, ID) && linked(ctx),
		Version:    osVersion(ctx),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return sequence(ctx, repairDpkg, installPackages, createSwap, enableMemoryGuard, configureUnattendedUpgrades, enableUnattendedUpgrades, raiseSystemLimits)
}

func (Module) Configure(ctx *modules.Context) error {
	return sequence(ctx, setTimezone, createUser, grantSudo, prepareHome, seedAuthorizedKeys, createProjectsDir, setGitIdentity, writeZshrc, writeBashrc, writeTmuxConf, linkDev)
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-packages", func() (modules.Outcome, error) {
		outcome := modules.Skipped
		for _, pkg := range Packages {
			upgraded, err := apt.Upgrade(ctx, pkg)
			if err != nil {
				return modules.Failed, err
			}

			if upgraded {
				outcome = modules.Done
			}
		}

		return outcome, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
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
