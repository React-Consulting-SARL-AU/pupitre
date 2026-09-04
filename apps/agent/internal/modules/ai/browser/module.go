package browser

import (
	"fmt"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Unit = "pupitre-shots"

	chromePackage   = "google-chrome-stable"
	chromiumPackage = "chromium"

	keyURL      = "https://dl.google.com/linux/linux_signing_key.pub"
	keyringPath = "/usr/share/keyrings/google-chrome.gpg"
	keyTempPath = "/tmp/pupitre-google-chrome.key"
	sourcePath  = "/etc/apt/sources.list.d/google-chrome.list"
	sourceLine  = "deb [arch=amd64 signed-by=" + keyringPath + "] https://dl.google.com/linux/chrome/deb/ stable main\n"

	unitPath = "/etc/systemd/system/" + Unit + ".service"
)

const unitTemplate = `[Unit]
Description=Galerie de captures Pupitre
After=network.target

[Service]
Type=simple
User=` + shots.User + `
ExecStart=` + shots.Binary + ` gallery --dir=` + shots.Dir + ` --port=%d
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`

// What a Chromium started by Playwright links against; a distribution that renamed one of them loses that one alone, never the browser.
var playwrightPackages = []string{
	"libnss3", "libnspr4", "libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libdrm2",
	"libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2",
	"libgbm1", "libpango-1.0-0", "libcairo2", "libasound2t64", "fonts-liberation",
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	pkg := installedPackage(ctx)
	if pkg == "" {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{
		Installed:  true,
		Version:    version,
		Configured: file.Exists(ctx, unitPath) && file.Exists(ctx, shots.Link),
	}, nil
}

func (Module) Install(ctx *modules.Context) error {
	if err := installBrowser(ctx); err != nil {
		return err
	}

	return installPlaywrightLibraries(ctx)
}

// Ubuntu's chromium package is a wrapper around a confined snap, which cannot write into ~/shots; the Google build is a real binary, and it only exists for amd64.
func installBrowser(ctx *modules.Context) error {
	return ctx.Step("install-browser", func() (modules.Outcome, error) {
		if installedPackage(ctx) != "" {
			return modules.Skipped, nil
		}

		if runtime.GOARCH == "amd64" {
			if err := addGoogleRepository(ctx); err == nil {
				if err := apt.Install(ctx, chromePackage); err == nil {
					return modules.Done, nil
				}
			}
		}

		if err := apt.Install(ctx, chromiumPackage); err != nil {
			ctx.Warn("aucun navigateur sans interface : shot <url> restera indisponible, shot <fichier> marche")

			return modules.Done, nil
		}

		return modules.Done, nil
	})
}

func addGoogleRepository(ctx *modules.Context) error {
	if !file.Exists(ctx, keyringPath) {
		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"curl", "-fsSL", "--proto", "=https", "--tlsv1.2", "-o", keyTempPath, keyURL}}); err != nil {
			return err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"gpg", "--batch", "--yes", "--dearmor", "-o", keyringPath, keyTempPath}}); err != nil {
			return err
		}

		if _, err := file.Remove(ctx, keyTempPath); err != nil {
			return err
		}
	}

	if !file.Same(ctx, sourcePath, []byte(sourceLine)) {
		if err := file.WriteAtomic(ctx, sourcePath, []byte(sourceLine), 0o644); err != nil {
			return err
		}
	}

	return apt.Refresh(ctx)
}

func installPlaywrightLibraries(ctx *modules.Context) error {
	return ctx.Step("install-playwright-libraries", func() (modules.Outcome, error) {
		missing := apt.Missing(ctx, playwrightPackages...)
		if len(missing) == 0 {
			return modules.Skipped, nil
		}

		if err := apt.Install(ctx, missing...); err == nil {
			return modules.Done, nil
		}

		var refused []string
		for _, pkg := range missing {
			if err := apt.Install(ctx, pkg); err != nil {
				refused = append(refused, pkg)
			}
		}

		if len(refused) > 0 {
			ctx.Warn("bibliothèques Playwright absentes de cette version d'Ubuntu : " + strings.Join(refused, ", "))
		}

		return modules.Done, nil
	})
}

func (Module) Configure(ctx *modules.Context) error {
	if err := createGallery(ctx); err != nil {
		return err
	}

	if err := linkShot(ctx); err != nil {
		return err
	}

	return enableGallery(ctx)
}

func createGallery(ctx *modules.Context) error {
	return ctx.Step("create-gallery", func() (modules.Outcome, error) {
		if file.Exists(ctx, shots.Dir) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(shots.Dir, 0o755); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.Chown(ctx, shots.Dir, shots.User, shots.User)
	})
}

// shot is the agent's own binary under another name: a command the agents call, and never a script laid on the client's disk.
func linkShot(ctx *modules.Context) error {
	return ctx.Step("link-shot-command", func() (modules.Outcome, error) {
		if target(ctx) == shots.Binary {
			return modules.Skipped, nil
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"ln", "-sfn", shots.Binary, shots.Link}}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func enableGallery(ctx *modules.Context) error {
	content := []byte(fmt.Sprintf(unitTemplate, shots.Port))
	changed := false

	if err := ctx.Step("write-gallery-service", func() (modules.Outcome, error) {
		if file.Same(ctx, unitPath, content) {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, systemd.WriteUnit(ctx, Unit, content)
	}); err != nil {
		return err
	}

	return ctx.Step("enable-gallery-service", func() (modules.Outcome, error) {
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
	if err := ctx.Step("upgrade-browser", func() (modules.Outcome, error) {
		pkg := installedPackage(ctx)
		if pkg == "" {
			return modules.Skipped, nil
		}

		upgraded, err := apt.Upgrade(ctx, pkg)
		if err != nil {
			return modules.Failed, err
		}

		if !upgraded {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

// The captures belong to the client: uninstalling gives back the browser, the command and the service, never ~/shots.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-gallery-service", func() (modules.Outcome, error) {
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
	}); err != nil {
		return err
	}

	if err := ctx.Step("unlink-shot-command", func() (modules.Outcome, error) {
		if target(ctx) == "" {
			return modules.Skipped, nil
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"rm", "-f", shots.Link}}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("remove-browser", func() (modules.Outcome, error) {
		pkg := installedPackage(ctx)
		if pkg == "" {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, Unit)
	status.Port = shots.Port
	status.Unit = Unit

	return status, nil
}

func installedPackage(ctx *modules.Context) string {
	for _, pkg := range []string{chromePackage, chromiumPackage} {
		if apt.Installed(ctx, pkg) {
			return pkg
		}
	}

	return ""
}

func target(ctx *modules.Context) string {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"readlink", shots.Link}})
	if err != nil {
		return ""
	}

	return strings.TrimSpace(out.Stdout)
}
