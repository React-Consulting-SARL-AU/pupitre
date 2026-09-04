package systemd

import (
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/sys"
)

const unitDir = "/etc/systemd/system"

func Enable(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, systemctl("enable", "--now", unit))

	return err
}

func Disable(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, systemctl("disable", "--now", unit))

	return err
}

func Restart(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, systemctl("restart", unit))

	return err
}

func Reload(ctx sys.Context, unit string) error {
	_, err := sys.Exec(ctx, systemctl("reload", unit))

	return err
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
