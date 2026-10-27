package browser

import (
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure"
	"pupitre.studio/agent/internal/sudo"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	chromePackage   = "google-chrome-stable"
	chromiumPackage = "chromium"

	keyURL      = "https://dl.google.com/linux/linux_signing_key.pub"
	keyringPath = "/usr/share/keyrings/google-chrome.gpg"
	sourcePath  = "/etc/apt/sources.list.d/google-chrome.list"
	sourceLine  = "deb [arch=amd64 signed-by=" + keyringPath + "] https://dl.google.com/linux/chrome/deb/ stable main\n"
)

// What the screenshot gallery left on a machine before 2.1.0: its service, its public address and the shot command.
const (
	retiredUnit     = "pupitre-shots"
	retiredUnitPath = "/etc/systemd/system/" + retiredUnit + ".service"
	retiredExposure = "/etc/pupitre/shots.env"

	RetiredLink = "/usr/local/bin/shot"
)

var playwrightLibraries = []string{
	"libnss3", "libnspr4", "libdrm2",
	"libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2",
	"libgbm1", "libpango-1.0-0", "libcairo2", "fonts-liberation",
}

// Ubuntu 24.04's 64-bit time_t transition added a t64 suffix to these four; 22.04 names them without it.
var renamedIn2404 = []string{"libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libasound2"}

const osReleasePath = "/etc/os-release"

// The machine's architecture; a test sets it so its transcript does not depend on the machine it runs on.
var Arch = runtime.GOARCH

func playwrightPackages(ctx *modules.Context) []string {
	suffix := ""
	if ubuntuRelease(ctx) >= "24.04" {
		suffix = "t64"
	}

	packages := append([]string{}, playwrightLibraries...)

	for _, name := range renamedIn2404 {
		packages = append(packages, name+suffix)
	}

	return packages
}

func ubuntuRelease(ctx *modules.Context) string {
	raw, err := file.Read(ctx, osReleasePath)
	if err != nil {
		return "24.04"
	}

	for _, line := range strings.Split(string(raw), "\n") {
		if value, found := strings.CutPrefix(line, "VERSION_ID="); found {
			return strings.Trim(value, `"`)
		}
	}

	return "24.04"
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) RefreshedOnStart() {}

// What the gallery left counts as installed: an arm64 server had it without a browser, and its upgrade must still run.
func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	version, err := installedVersion(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	left := galleryLeft(ctx)
	if version == "" && !left {
		return modules.Status{}, nil
	}

	return modules.Status{
		Installed:  true,
		Version:    version,
		Configured: version != "" && !left,
	}, nil
}

func installedVersion(ctx *modules.Context) (string, error) {
	if version := headlessInstalled(ctx); version != "" {
		return version, nil
	}

	pkg := installedPackage(ctx)
	if pkg == "" {
		return "", nil
	}

	return apt.Version(ctx, pkg)
}

func (Module) Install(ctx *modules.Context) error {
	if err := installBrowser(ctx); err != nil {
		return err
	}

	return installPlaywrightLibraries(ctx)
}

// Ubuntu's chromium is a snap behind an apt stub that exits 0: Google's apt build on amd64, Chrome for Testing's headless shell on arm64.
func installBrowser(ctx *modules.Context) error {
	return ctx.Step("install-browser", func() (modules.Outcome, error) {
		if installedPackage(ctx) != "" || headlessInstalled(ctx) != "" {
			return modules.Skipped, nil
		}

		if Arch == "arm64" {
			if err := installHeadless(ctx); err != nil {
				ctx.Warn(i18n.T("warn.browser.none"))

				return modules.Skipped, nil
			}

			return modules.Done, nil
		}

		if err := addGoogleRepository(ctx); err == nil {
			if err := apt.Install(ctx, chromePackage); err == nil {
				return modules.Done, nil
			}
		}

		if err := apt.Install(ctx, chromiumPackage); err != nil || !apt.Installed(ctx, chromiumPackage) {
			ctx.Warn(i18n.T("warn.browser.none"))

			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

func addGoogleRepository(ctx *modules.Context) error {
	if !file.Exists(ctx, keyringPath) {
		if err := apt.DearmorKey(ctx, keyURL, keyringPath); err != nil {
			return err
		}
	}

	if !file.Same(ctx, sourcePath, []byte(sourceLine)) {
		if err := file.WriteAtomic(ctx, sourcePath, []byte(sourceLine), 0o644); err != nil {
			return err
		}
	}

	return apt.RefreshAdded(ctx, sourcePath, keyringPath)
}

func installPlaywrightLibraries(ctx *modules.Context) error {
	return ctx.Step("install-playwright-libraries", func() (modules.Outcome, error) {
		missing := apt.Missing(ctx, playwrightPackages(ctx)...)
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
			ctx.Warn(i18n.T("warn.browser.libraries.missing", strings.Join(refused, ", ")))
		}

		return modules.Done, nil
	})
}

func (Module) Configure(ctx *modules.Context) error {
	return retireGallery(ctx)
}

// A server whose install found no browser gets one now: arm64 had none before the headless shell.
func (m Module) Upgrade(ctx *modules.Context) error {
	if err := m.Install(ctx); err != nil {
		return err
	}

	if err := ctx.Step("upgrade-browser", func() (modules.Outcome, error) {
		if held := headlessInstalled(ctx); held != "" {
			if held == headlessVersion {
				return modules.Skipped, nil
			}

			return modules.Done, installHeadless(ctx)
		}

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

// ~/shots holds the client's earlier captures: it is theirs, and stays.
func retireGallery(ctx *modules.Context) error {
	if err := ctx.Step("retire-gallery-service", func() (modules.Outcome, error) {
		if !file.Exists(ctx, retiredUnitPath) {
			return modules.Skipped, nil
		}

		if err := systemd.Disable(ctx, retiredUnit); err != nil {
			return modules.Failed, err
		}

		if _, err := file.Remove(ctx, retiredUnitPath); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("retire-gallery-address", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, retiredExposure)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		if _, err := exposure.Resync(ctx.Sibling); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	return ctx.Step("retire-shot-command", func() (modules.Outcome, error) {
		if !shotLinked(ctx) {
			return modules.Skipped, nil
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"rm", "-f", RetiredLink}}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func (Module) Uninstall(ctx *modules.Context) error {
	if err := retireGallery(ctx); err != nil {
		return err
	}

	return ctx.Step("remove-browser", func() (modules.Outcome, error) {
		if headlessInstalled(ctx) != "" {
			return modules.Done, removeHeadless(ctx)
		}

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

	status.State = contract.ServiceStopped
	if status.Installed {
		status.State = contract.ServiceRunning
	}

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

func galleryLeft(ctx *modules.Context) bool {
	return file.Exists(ctx, retiredUnitPath) || file.Exists(ctx, retiredExposure) || shotLinked(ctx)
}

// Only a link to the agent is ours to remove; any other program under that name is someone else's.
func shotLinked(ctx *modules.Context) bool {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"readlink", RetiredLink}})

	return err == nil && strings.TrimSpace(out.Stdout) == sudo.Binary
}
