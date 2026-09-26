package browser

import (
	"fmt"
	"runtime"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/shots"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Unit = "pupitre-shots"

	chromePackage   = "google-chrome-stable"
	chromiumPackage = "chromium"

	keyURL      = "https://dl.google.com/linux/linux_signing_key.pub"
	keyringPath = "/usr/share/keyrings/google-chrome.gpg"
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
EnvironmentFile=-` + shots.ExposurePath + `
ExecStart=` + shots.Binary + ` gallery --dir=` + shots.Dir + ` --port=%d
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
`

var playwrightLibraries = []string{
	"libnss3", "libnspr4", "libdrm2",
	"libxkbcommon0", "libxcomposite1", "libxdamage1", "libxfixes3", "libxrandr2",
	"libgbm1", "libpango-1.0-0", "libcairo2", "fonts-liberation",
}

// Ubuntu 24.04's 64-bit time_t transition added a t64 suffix to these four; 22.04 names them without it.
var renamedIn2404 = []string{"libatk1.0-0", "libatk-bridge2.0-0", "libcups2", "libasound2"}

const osReleasePath = "/etc/os-release"

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

// The chromium snap cannot write into ~/shots and its apt stub exits 0: Google's build on amd64, and a check by name.
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

func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	subdomain := ctx.String(SubdomainKey)
	if subdomain == "" {
		return []contract.FieldProblem{}
	}

	domain, _, _ := env.Get(ctx, env.DomainKey)
	if domain == "" {
		return []contract.FieldProblem{subdomainProblem(ctx, i18n.T("module.ai.browser.subdomain.noDomain"))}
	}

	if project := routeHolder(ctx, subdomain+"."+domain); project != "" {
		return []contract.FieldProblem{subdomainProblem(ctx, i18n.T("module.ai.browser.subdomain.taken", subdomain+"."+domain, project))}
	}

	return []contract.FieldProblem{}
}

func subdomainProblem(ctx *modules.Context, message string) contract.FieldProblem {
	return contract.FieldProblem{
		Module:   ctx.Module(),
		Field:    SubdomainKey,
		Code:     contract.ProblemFormat,
		Expected: contract.FormatHostname,
		Message:  message,
	}
}

func routeHolder(ctx *modules.Context, hostname string) string {
	for _, project := range routes.Declared(ctx) {
		for _, process := range project.Processes {
			for _, route := range process.Routes {
				if route.Hostname == hostname {
					return project.Name
				}
			}
		}
	}

	return ""
}

func (Module) Configure(ctx *modules.Context) error {
	if err := createGallery(ctx); err != nil {
		return err
	}

	if err := fileLooseCaptures(ctx); err != nil {
		return err
	}

	if err := linkShot(ctx); err != nil {
		return err
	}

	exposed, err := exposeGallery(ctx)
	if err != nil {
		return err
	}

	return enableGallery(ctx, exposed)
}

func fileLooseCaptures(ctx *modules.Context) error {
	return ctx.Step("file-loose-captures", func() (modules.Outcome, error) {
		moved, err := shots.FileLoose(ctx, shots.Dir)
		if err != nil {
			return modules.Failed, err
		}

		if moved == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// The token outlives a change of subdomain; only withdrawing the exposure forgets it.
func exposeGallery(ctx *modules.Context) (bool, error) {
	changed := false

	err := ctx.Step("write-gallery-exposure", func() (modules.Outcome, error) {
		subdomain := ctx.String(SubdomainKey)
		if subdomain == "" {
			removed, err := file.Remove(ctx, shots.ExposurePath)
			if err != nil || !removed {
				return modules.Skipped, err
			}

			changed = true

			return modules.Done, nil
		}

		domain, _, err := env.Get(ctx, env.DomainKey)
		if err != nil || domain == "" {
			return modules.Failed, protocol.NewError(contract.ErrorBadRequest, i18n.T("module.ai.browser.subdomain.noDomain")).
				WithFix(i18n.T("module.ai.browser.subdomain.noDomain.fix"))
		}

		exposure := shots.ReadExposure(ctx)
		exposure.Hostname = subdomain + "." + domain

		if exposure.Token == "" {
			token, err := shots.NewToken()
			if err != nil {
				return modules.Failed, err
			}

			exposure.Token = token
		}

		if file.SameAt(ctx, shots.ExposurePath, exposure.Content(), 0o600) {
			return modules.Skipped, nil
		}

		changed = true

		return modules.Done, shots.WriteExposure(ctx, exposure)
	})

	return changed, err
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

// A link to the agent's own binary, never a readable script left on the client's disk.
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

// The gallery reads its token once, at start: a new exposure restarts it.
func enableGallery(ctx *modules.Context, exposed bool) error {
	content := []byte(fmt.Sprintf(unitTemplate, shots.Port))
	changed := exposed

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

// ~/shots holds the client's captures and survives an uninstall.
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

	if err := ctx.Step("forget-gallery-exposure", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, shots.ExposurePath)
		if err != nil || !removed {
			return modules.Skipped, err
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
