package tailscale

import (
	"encoding/json"
	"errors"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/host"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/ufw"
)

const (
	Program = "tailscale"
	Unit    = "tailscaled"

	pkg         = "tailscale"
	keyURL      = "https://pkgs.tailscale.com/stable/ubuntu/%s.noarmor.gpg"
	keyringPath = "/usr/share/keyrings/tailscale-archive-keyring.gpg"
	sourcePath  = "/etc/apt/sources.list.d/tailscale.list"

	device      = "tailscale0"
	authKeyDir  = "/etc/pupitre"
	authKeyPath = authKeyDir + "/tailscale-auth-key"

	// A refused key answers within seconds; only an unreachable coordination server runs this long.
	joinTimeout = 2 * time.Minute
)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !apt.Installed(ctx, pkg) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: status(ctx).running()}, nil
}

// Tailscale is not in the Ubuntu archive, hence its own repository.
func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("add-repository", func() (modules.Outcome, error) {
		release := host.Codename(ctx)
		list := repository(release)

		if file.Exists(ctx, keyringPath) && file.Same(ctx, sourcePath, list) {
			return modules.Skipped, nil
		}

		if err := apt.DownloadKey(ctx, strings.Replace(keyURL, "%s", release, 1), keyringPath); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, sourcePath, list, 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.RefreshAdded(ctx, sourcePath, keyringPath)
	}); err != nil {
		return err
	}

	return ctx.Step("install-package", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

func (Module) Configure(ctx *modules.Context) error {
	if err := ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, Unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Enable(ctx, Unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("join-tailnet", func() (modules.Outcome, error) {
		if status(ctx).running() {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(authKeyDir, 0o700); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, authKeyPath, []byte(ctx.Secret("auth_key")+"\n"), 0o600); err != nil {
			return modules.Failed, err
		}
		defer file.Remove(ctx, authKeyPath)

		_, err := sys.Exec(ctx, sys.Command{Argv: upArgs(ctx), Timeout: joinTimeout})
		if err != nil {
			return modules.Failed, err
		}

		if !status(ctx).running() {
			return modules.Failed, errors.New(i18n.T("modules.tailscale.not_running"))
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := applySettings(ctx); err != nil {
		return err
	}

	return ctx.Step("open-firewall", func() (modules.Outcome, error) {
		if allowedOnDevice(ctx) {
			return modules.Skipped, nil
		}

		if _, err := ufw.Run(ctx, "allow", "in", "on", device, "comment", "tailscale"); err != nil {
			ctx.Warn(i18n.T("warn.tailscale.ufw.refused", device))
		}

		return modules.Done, nil
	})
}

// The key goes through a root-only file, never on an argv ps would show.
func upArgs(ctx *modules.Context) []string {
	args := []string{Program, "up", "--auth-key=file:" + authKeyPath, "--reset"}

	if hostname := wantedHostname(ctx); hostname != "" {
		args = append(args, "--hostname="+hostname)
	}

	if ctx.Bool("ssh") {
		args = append(args, "--ssh")
	}

	return args
}

// A joined node keeps what up gave it, so later changes are set on the running node without a second sign-in.
func applySettings(ctx *modules.Context) error {
	return ctx.Step("apply-settings", func() (modules.Outcome, error) {
		wanted := prefs{Hostname: wantedHostname(ctx), RunSSH: ctx.Bool("ssh")}

		if current, known := currentPrefs(ctx); known && current == wanted {
			return modules.Skipped, nil
		}

		argv := []string{Program, "set", "--hostname=" + wanted.Hostname, "--ssh=" + strconv.FormatBool(wanted.RunSSH)}
		if _, err := sys.Exec(ctx, sys.Command{Argv: argv}); err != nil {
			return modules.Failed, err
		}

		return modules.Done, nil
	})
}

func wantedHostname(ctx *modules.Context) string {
	return strings.TrimSpace(ctx.String("hostname"))
}

type prefs struct {
	Hostname string `json:"Hostname"`
	RunSSH   bool   `json:"RunSSH"`
}

// A CLI that cannot answer reads as unknown, so the settings are set again.
func currentPrefs(ctx *modules.Context) (prefs, bool) {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{Program, "debug", "prefs"}})
	if err != nil {
		return prefs{}, false
	}

	var current prefs
	if json.Unmarshal([]byte(out.Stdout), &current) != nil {
		return prefs{}, false
	}

	return current, true
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-package", func() (modules.Outcome, error) {
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

// Leave the tailnet before removing the package, or the dead node stays listed in the client's admin console.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("leave-tailnet", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg) || !status(ctx).running() {
			return modules.Skipped, nil
		}

		_, err := sys.Exec(ctx, sys.Command{Argv: []string{Program, "logout"}, Timeout: joinTimeout})

		return modules.Done, err
	}); err != nil {
		return err
	}

	if err := ctx.Step("close-firewall", func() (modules.Outcome, error) {
		if !allowedOnDevice(ctx) {
			return modules.Skipped, nil
		}

		_, err := ufw.Run(ctx, "delete", "allow", "in", "on", device)

		return modules.Done, err
	}); err != nil {
		return err
	}

	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, Unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Disable(ctx, Unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-package", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	return ctx.Step("remove-repository", func() (modules.Outcome, error) {
		outcome := modules.Skipped

		for _, path := range []string{sourcePath, keyringPath} {
			removed, err := file.Remove(ctx, path)
			if err != nil {
				return modules.Failed, err
			}

			if removed {
				outcome = modules.Done
			}
		}

		return outcome, nil
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

type backend struct {
	BackendState string `json:"BackendState"`
	Self         struct {
		HostName string `json:"HostName"`
		DNSName  string `json:"DNSName"`
		UserID   int64  `json:"UserID"`
	} `json:"Self"`
	User map[string]struct {
		LoginName string `json:"LoginName"`
	} `json:"User"`
}

func (b backend) running() bool {
	return b.BackendState == "Running"
}

func (b backend) account() string {
	for _, user := range b.User {
		if user.LoginName != "" {
			return user.LoginName
		}
	}

	return strings.TrimSuffix(b.Self.DNSName, ".")
}

func status(ctx *modules.Context) backend {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{Program, "status", "--json"}})
	if err != nil {
		return backend{}
	}

	var parsed backend
	_ = json.Unmarshal([]byte(out.Stdout), &parsed)

	return parsed
}

// tailscale status answers locally, without reaching the coordination server.
func (Module) Login(ctx *modules.Context) (contract.Login, bool) {
	out, err := login.Ask(ctx, nil, Program, "status", "--json")

	var parsed backend
	if err != nil || json.Unmarshal([]byte(out.Stdout), &parsed) != nil || parsed.BackendState == "" {
		return login.Unknown(i18n.T("login.unanswered", "Tailscale", Program+" status"))
	}

	if !parsed.running() {
		return login.SignedOut(i18n.T("login.tailscale.fix"))
	}

	return login.SignedIn(parsed.account())
}

// Read whether ufw is up or not: the hardening may come after this module.
func allowedOnDevice(ctx *modules.Context) bool {
	for _, rule := range ufw.Added(ctx) {
		if strings.HasPrefix(rule, "ufw allow in on "+device) {
			return true
		}
	}

	return false
}

func repository(release string) []byte {
	return []byte("deb [signed-by=" + keyringPath + "] https://pkgs.tailscale.com/stable/ubuntu " + release + " main\n")
}
