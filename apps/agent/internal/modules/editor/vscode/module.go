package vscode

import (
	"errors"
	"fmt"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/user"
)

const (
	Unit = "pupitre-code-tunnel"

	ServerRoot    = shell.Home + "/.vscode-server"
	binRoot       = ServerRoot + "/bin"
	cliServers    = ServerRoot + "/cli/servers"
	extensionsDir = ServerRoot + "/extensions"
	pointerPath   = ServerRoot + "/pupitre-release.json"

	cliPath       = "/usr/local/bin/code"
	cliDir        = "/usr/local/bin"
	cliArchive    = "code-cli.tar.gz"
	serverArchive = "code-server.tar.gz"
	unitPath      = "/etc/systemd/system/" + Unit + ".service"

	hostnamePath = "/etc/hostname"
	defaultName  = "pupitre"
)

const unitTemplate = `[Unit]
Description=Tunnel VS Code Pupitre
After=network-online.target

[Service]
Type=simple
User=` + shell.User + `
ExecStart=` + cliPath + ` tunnel --accept-server-license-terms --name %s
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	installed := recorded(ctx)
	if installed.Commit == "" || !file.Exists(ctx, installed.serverDir()) {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Configured: file.Exists(ctx, cliPath),
		Version:    installed.Version,
	}, nil
}

func (m Module) Install(ctx *modules.Context) error {
	if err := installCLI(ctx); err != nil {
		return err
	}

	return installServer(ctx)
}

func installCLI(ctx *modules.Context) error {
	return ctx.Step("install-cli", func() (modules.Outcome, error) {
		if file.Exists(ctx, cliPath) {
			return modules.Skipped, nil
		}

		return modules.Done, fetchCLI(ctx)
	})
}

func fetchCLI(ctx *modules.Context) error {
	found, err := cli(ctx)
	if err != nil {
		return err
	}

	staged, done, err := download.Verified(ctx, cliArchive, found.url, found.sha256)
	if err != nil {
		return err
	}
	defer done()

	if err := download.Extract(ctx, staged, cliDir, 0, "root"); err != nil {
		return err
	}

	if _, err := user.Run(ctx, "root", "chmod", "0755", cliPath); err != nil {
		return err
	}

	if !file.Exists(ctx, cliPath) {
		return errors.New(i18n.T("modules.vscode.cli_missing", cliPath))
	}

	return nil
}

func installServer(ctx *modules.Context) error {
	var found release

	if err := ctx.Step("install-server", func() (modules.Outcome, error) {
		resolved, err := resolve(ctx)
		if err != nil {
			return modules.Failed, err
		}

		found = resolved

		if file.Exists(ctx, resolved.serverCLI()) {
			return modules.Skipped, nil
		}

		return modules.Done, unpackServer(ctx, resolved)
	}); err != nil {
		return err
	}

	return linkServer(ctx, found)
}

func unpackServer(ctx *modules.Context, found release) error {
	for _, dir := range []string{ServerRoot, binRoot, found.serverDir()} {
		if err := ctx.Sys().MkdirAll(dir, 0o755); err != nil {
			return err
		}

		if err := file.Chown(ctx, dir, shell.User, shell.User); err != nil {
			return err
		}
	}

	staged, done, err := download.Verified(ctx, serverArchive, found.url, found.sha256)
	if err != nil {
		return err
	}
	defer done()

	if err := download.Extract(ctx, staged, found.serverDir(), 1, shell.User); err != nil {
		return err
	}

	if !file.Exists(ctx, found.serverCLI()) {
		return errors.New(i18n.T("modules.vscode.server_missing", found.serverDir()))
	}

	return nil
}

func linkServer(ctx *modules.Context, found release) error {
	return ctx.Step("link-server", func() (modules.Outcome, error) {
		link := found.serverLink()
		if target(ctx, link) == found.serverDir() {
			return modules.Skipped, nil
		}

		for _, dir := range []string{cliServers, cliServers + "/Stable-" + found.Commit} {
			if err := ctx.Sys().MkdirAll(dir, 0o755); err != nil {
				return modules.Failed, err
			}

			if err := file.Chown(ctx, dir, shell.User, shell.User); err != nil {
				return modules.Failed, err
			}
		}

		if _, err := user.Run(ctx, shell.User, "ln", "-sfn", found.serverDir(), link); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func (m Module) Configure(ctx *modules.Context) error {
	if err := recordRelease(ctx); err != nil {
		return err
	}

	if err := installExtensions(ctx); err != nil {
		return err
	}

	return tunnel(ctx, ctx.Bool("tunnel"))
}

func recordRelease(ctx *modules.Context) error {
	return ctx.Step("record-release", func() (modules.Outcome, error) {
		found, err := resolve(ctx)
		if err != nil {
			return modules.Failed, err
		}

		content := found.record()
		if file.Same(ctx, pointerPath, content) {
			return modules.Skipped, nil
		}

		if err := file.WriteAtomic(ctx, pointerPath, content, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, pointerPath, shell.User, shell.User)
	})
}

func installExtensions(ctx *modules.Context) error {
	return ctx.Step("install-extensions", func() (modules.Outcome, error) {
		wanted := extensions(ctx)
		if len(wanted) == 0 {
			return modules.Skipped, nil
		}

		installed := recorded(ctx)
		if installed.Commit == "" {
			return modules.Failed, errors.New(i18n.T("modules.vscode.no_server"))
		}

		missing := absent(ctx, installed, wanted)
		if len(missing) == 0 {
			return modules.Skipped, nil
		}

		for _, extension := range missing {
			if _, err := user.Run(ctx, shell.User, installed.serverCLI(), "--install-extension", extension, "--force"); err != nil {
				ctx.Warn(i18n.T("warn.vscode.extension.refused", extension))
			}
		}

		return modules.Done, nil
	})
}

func absent(ctx *modules.Context, installed release, wanted []string) []string {
	out, err := user.Run(ctx, shell.User, installed.serverCLI(), "--list-extensions")
	if err != nil {
		return wanted
	}

	present := map[string]bool{}
	for _, line := range strings.Split(out, "\n") {
		present[strings.ToLower(strings.TrimSpace(line))] = true
	}

	var missing []string
	for _, extension := range wanted {
		if !present[strings.ToLower(extension)] {
			missing = append(missing, extension)
		}
	}

	return missing
}

// Without the tunnel VS Code reaches the machine through the SSH session the app already holds; the service only exists for the client who asked for it.
func tunnel(ctx *modules.Context, wanted bool) error {
	if !wanted {
		return ctx.Step("disable-tunnel", func() (modules.Outcome, error) {
			if !file.Exists(ctx, unitPath) {
				return modules.Skipped, nil
			}

			if err := systemd.Disable(ctx, Unit); err != nil {
				return modules.Failed, err
			}

			removed, err := file.Remove(ctx, unitPath)
			if err != nil {
				return modules.Failed, err
			}

			if !removed {
				return modules.Skipped, nil
			}

			return modules.Done, nil
		})
	}

	content := []byte(fmt.Sprintf(unitTemplate, machineName(ctx)))
	changed := false

	if err := ctx.Step("write-tunnel-service", func() (modules.Outcome, error) {
		if file.Same(ctx, unitPath, content) {
			return modules.Skipped, nil
		}

		changed = true
		ctx.Warn(i18n.T("warn.vscode.tunnel.login", cliPath))

		return modules.Done, systemd.WriteUnit(ctx, Unit, content)
	}); err != nil {
		return err
	}

	return ctx.Step("enable-tunnel-service", func() (modules.Outcome, error) {
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
	// The archive is unpacked over the command in place: a machine that loses its network keeps the CLI it already had.
	if err := ctx.Step("upgrade-cli", func() (modules.Outcome, error) {
		if !file.Exists(ctx, cliPath) {
			return modules.Skipped, nil
		}

		return modules.Done, fetchCLI(ctx)
	}); err != nil {
		return err
	}

	if err := m.Install(ctx); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The extensions and everything the client opened stay; the server, the CLI and the tunnel go.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := tunnel(ctx, false); err != nil {
		return err
	}

	installed := recorded(ctx)

	if err := ctx.Step("remove-server", func() (modules.Outcome, error) {
		if installed.Commit == "" || !file.Exists(ctx, installed.serverCLI()) {
			return modules.Skipped, nil
		}

		if _, err := user.Run(ctx, shell.User, "rm", "-rf", installed.serverDir(), installed.serverLink()); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-cli", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, cliPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("forget-release", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, pointerPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
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

	status.State = contract.ServiceUnknown
	if status.Installed {
		status.State = contract.ServiceRunning
	}

	if file.Exists(ctx, unitPath) {
		status.State = systemd.State(ctx, Unit)
		status.Unit = Unit
	}

	return status, nil
}

func target(ctx *modules.Context, link string) string {
	out, err := user.Run(ctx, shell.User, "readlink", link)
	if err != nil {
		return ""
	}

	return strings.TrimSpace(out)
}

func machineName(ctx *modules.Context) string {
	raw, err := file.Read(ctx, hostnamePath)
	if err != nil {
		return defaultName
	}

	name := strings.TrimSpace(string(raw))
	if name == "" {
		return defaultName
	}

	return name
}
