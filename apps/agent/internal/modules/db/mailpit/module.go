package mailpit

import (
	"fmt"
	"runtime"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/download"
	"pupitre.studio/agent/internal/modules/runtime/shell"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Program = "mailpit"
	Unit    = "pupitre-mailpit"

	DefaultSMTPPort = 1025
	DefaultHTTPPort = 8025

	BinPath  = "/usr/local/bin/" + Program
	dataDir  = shell.Home + "/.local/share/" + Program
	database = dataDir + "/mailpit.db"
	unitPath = "/etc/systemd/system/" + Unit + ".service"

	unitTemplate = `[Unit]
Description=Mailpit
After=network.target

[Service]
Type=simple
User=` + shell.User + `
ExecStart=` + BinPath + ` --smtp 127.0.0.1:%d --listen 127.0.0.1:%d --database ` + database + `
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`
)

// Mailpit publishes one archive per platform and no checksum document: GitHub's own digest of the asset is what the download is held to.
var release = download.GitHubRelease{
	Repo:    "axllent/mailpit",
	Program: Program,
	Asset: func(string) string {
		return Program + "-linux-" + platform() + ".tar.gz"
	},
}

func platform() string {
	if runtime.GOARCH == "arm64" {
		return "arm64"
	}

	return "amd64"
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

// A port another program already holds is the one thing this configuration cannot know from the manifest alone.
func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(modules.PortTaken(ctx, "smtp_port"), modules.PortTaken(ctx, "http_port"))
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !file.Exists(ctx, BinPath) {
		return modules.Status{}, nil
	}

	return modules.Status{Installed: true, Version: download.Recorded(ctx, ID), Configured: file.Exists(ctx, unitPath)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return release.InstallStep(ctx, ID, BinPath)
}

func (Module) Configure(ctx *modules.Context) error {
	if err := ctx.Step("create-data-dir", func() (modules.Outcome, error) {
		if file.Exists(ctx, dataDir) {
			return modules.Skipped, nil
		}

		return modules.Done, file.MkdirOwned(ctx, dataDir, shell.User, shell.User, 0o750)
	}); err != nil {
		return err
	}

	content := renderUnit(smtpPort(ctx), httpPort(ctx))
	changed := false

	if err := ctx.Step("write-service", func() (modules.Outcome, error) {
		if file.Same(ctx, unitPath, content) {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, systemd.WriteUnit(ctx, Unit, content)
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
	before := download.Recorded(ctx, ID)
	if err := release.UpgradeStep(ctx, ID, BinPath); err != nil {
		return err
	}

	if err := ctx.Step("restart-service", func() (modules.Outcome, error) {
		if download.Recorded(ctx, ID) == before || !systemd.Active(ctx, Unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Restart(ctx, Unit)
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The messages it caught stay under the client's home: only the binary and the unit go.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, Unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Disable(ctx, Unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-service", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, unitPath)
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

	return release.RemoveStep(ctx, ID, BinPath)
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, Unit)
	status.Port = httpPort(ctx)
	status.Unit = Unit

	return status, nil
}

func smtpPort(ctx *modules.Context) int {
	if chosen := ctx.Int("smtp_port"); chosen != 0 {
		return chosen
	}

	return DefaultSMTPPort
}

func httpPort(ctx *modules.Context) int {
	if chosen := ctx.Int("http_port"); chosen != 0 {
		return chosen
	}

	return DefaultHTTPPort
}

func renderUnit(smtp, http int) []byte {
	return []byte(fmt.Sprintf(unitTemplate, smtp, http))
}
