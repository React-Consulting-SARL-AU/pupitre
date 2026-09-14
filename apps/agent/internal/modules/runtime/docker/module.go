package docker

import (
	"encoding/json"
	"runtime"
	"slices"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	Unit = "docker"

	enginePkg  = "docker-ce"
	cliPkg     = "docker-ce-cli"
	runtimePkg = "containerd.io"
	composePkg = "docker-compose-plugin"
	buildxPkg  = "docker-buildx-plugin"

	group = "docker"

	keyURL      = "https://download.docker.com/linux/ubuntu/gpg"
	keyringDir  = "/etc/apt/keyrings"
	keyringPath = keyringDir + "/docker.asc"
	sourcePath  = "/etc/apt/sources.list.d/docker.list"

	osReleasePath   = "/etc/os-release"
	defaultCodename = "noble"

	configDir  = "/etc/docker"
	configPath = configDir + "/daemon.json"

	defaultLogSize = "10m"
	logFiles       = "3"
)

// live-restore keeps the containers running across a daemon restart: a rewritten configuration or an upgrade costs no project its database.
type daemon struct {
	DataRoot    string            `json:"data-root,omitempty"`
	LiveRestore bool              `json:"live-restore"`
	LogDriver   string            `json:"log-driver"`
	LogOpts     map[string]string `json:"log-opts"`
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, enginePkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, enginePkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, configPath)}, nil
}

// Docker Engine is not in the Ubuntu archive: the module adds Docker's own repository, key first.
func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("add-repository", func() (modules.Outcome, error) {
		list := repository(codename(ctx))
		if file.Exists(ctx, keyringPath) && file.Same(ctx, sourcePath, list) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(keyringDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", keyringPath, keyURL}}); err != nil {
			return modules.Failed, err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"chmod", "0644", keyringPath}}); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, sourcePath, list, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.Refresh(ctx)
	}); err != nil {
		return err
	}

	return ctx.Step("install-engine", func() (modules.Outcome, error) {
		missing := apt.Missing(ctx, packages(ctx.Bool("compose"))...)
		if len(missing) == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, missing...)
	})
}

func (Module) Configure(ctx *modules.Context) error {
	changed := false

	if err := ctx.Step("write-daemon-config", func() (modules.Outcome, error) {
		content, err := config(ctx)
		if err != nil {
			return modules.Failed, err
		}

		if file.Same(ctx, configPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(configDir, 0o755); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, configPath, content, 0o644)
	}); err != nil {
		return err
	}

	// Without the group, every docker command needs sudo, and the agents that run as dev would stop at the first one.
	if err := ctx.Step("join-docker-group", func() (modules.Outcome, error) {
		groups, err := user.Groups(ctx, shell.User)
		if err != nil {
			return modules.Failed, err
		}

		if slices.Contains(groups, group) {
			return modules.Skipped, nil
		}

		_, err = sys.Exec(ctx, sys.Command{Argv: []string{"usermod", "-aG", group, shell.User}})

		return modules.Done, err
	}); err != nil {
		return err
	}

	return ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, Unit) && !changed {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, Unit); err != nil {
			return modules.Failed, err
		}

		return modules.Done, systemd.Restart(ctx, Unit)
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-engine", func() (modules.Outcome, error) {
		touched := false

		for _, pkg := range packages(ctx.Bool("compose")) {
			if !apt.Installed(ctx, pkg) {
				continue
			}

			upgraded, err := apt.Upgrade(ctx, pkg)
			if err != nil {
				return modules.Failed, err
			}

			touched = touched || upgraded
		}

		if !touched {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// Images, volumes and containers are the client's: uninstalling takes back the engine and leaves /var/lib/docker where it is.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, Unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Disable(ctx, Unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-engine", func() (modules.Outcome, error) {
		installed := []string{}
		for _, pkg := range packages(true) {
			if apt.Installed(ctx, pkg) {
				installed = append(installed, pkg)
			}
		}

		if len(installed) == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, installed...)
	}); err != nil {
		return err
	}

	return ctx.Step("remove-config", func() (modules.Outcome, error) {
		cleared := false

		for _, path := range []string{configPath, sourcePath} {
			removed, err := file.Remove(ctx, path)
			if err != nil {
				return modules.Failed, err
			}

			cleared = cleared || removed
		}

		if !cleared {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, Unit)
	status.Unit = Unit

	return status, nil
}

func packages(compose bool) []string {
	list := []string{enginePkg, cliPkg, runtimePkg}
	if compose {
		list = append(list, composePkg, buildxPkg)
	}

	return list
}

func config(ctx *modules.Context) ([]byte, error) {
	size := strings.TrimSpace(ctx.String("log_max_size"))
	if size == "" {
		size = defaultLogSize
	}

	content, err := json.MarshalIndent(daemon{
		DataRoot:    strings.TrimSpace(ctx.String("data_root")),
		LiveRestore: true,
		LogDriver:   "json-file",
		LogOpts:     map[string]string{"max-size": size, "max-file": logFiles},
	}, "", "  ")
	if err != nil {
		return nil, err
	}

	return append(content, '\n'), nil
}

func repository(release string) []byte {
	return []byte("deb [arch=" + runtime.GOARCH + " signed-by=" + keyringPath + "] https://download.docker.com/linux/ubuntu " + release + " stable\n")
}

func codename(ctx *modules.Context) string {
	raw, err := file.Read(ctx, osReleasePath)
	if err != nil {
		return defaultCodename
	}

	for _, line := range strings.Split(string(raw), "\n") {
		if value, ok := strings.CutPrefix(line, "VERSION_CODENAME="); ok {
			return strings.Trim(value, `"`)
		}
	}

	return defaultCodename
}
