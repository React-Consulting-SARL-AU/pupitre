package tailscale

import (
	"encoding/json"
	"errors"
	"strings"
	"time"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/login"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Program = "tailscale"
	Unit    = "tailscaled"

	pkg           = "tailscale"
	keyURL        = "https://pkgs.tailscale.com/stable/ubuntu/%s.noarmor.gpg"
	keyringPath   = "/usr/share/keyrings/tailscale-archive-keyring.gpg"
	sourcePath    = "/etc/apt/sources.list.d/tailscale.list"
	osReleasePath = "/etc/os-release"

	defaultCodename = "noble"
	device          = "tailscale0"

	// ufw rewrites the whole rule set through iptables and can sit there for ever on a kernel that refuses it; a minute is more than it ever needs.
	ufwTimeout = time.Minute
	// Joining reaches the coordination server; a key that is refused answers within seconds, a network that is down within this.
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

// Tailscale is not in the Ubuntu archive: the module adds Tailscale's own repository, key first.
func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("add-repository", func() (modules.Outcome, error) {
		release := codename(ctx)
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

		return modules.Done, apt.Refresh(ctx)
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

	return ctx.Step("open-firewall", func() (modules.Outcome, error) {
		if allowedOnDevice(ctx) {
			return modules.Skipped, nil
		}

		if _, err := ufw(ctx, "allow", "in", "on", device, "comment", "tailscale"); err != nil {
			ctx.Warn(i18n.T("warn.tailscale.ufw.refused", device))
		}

		return modules.Done, nil
	})
}

// The key goes on the command line the way tailscale takes it; the journal replaces it with [secret].
func upArgs(ctx *modules.Context) []string {
	args := []string{Program, "up", "--auth-key=" + ctx.Secret("auth_key"), "--reset"}

	if hostname := strings.TrimSpace(ctx.String("hostname")); hostname != "" {
		args = append(args, "--hostname="+hostname)
	}

	if ctx.Bool("ssh") {
		args = append(args, "--ssh")
	}

	return args
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

// The node leaves the tailnet before the package goes: a machine that is no longer reachable must not stay listed in the client's admin console.
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

		_, err := ufw(ctx, "delete", "allow", "in", "on", device)

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

// The login that owns the node, as the coordination server names it; the node's own name when the status carries no user.
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

// tailscale status says whether the node is on a tailnet, and under whose login; it never reaches the coordination server for that.
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

func ufw(ctx *modules.Context, args ...string) (sys.Output, error) {
	return sys.Exec(ctx, sys.Command{Argv: append([]string{"ufw"}, args...), Timeout: ufwTimeout})
}

// ufw prints an interface rule as "Anywhere on tailscale0"; the v6 twin is the same rule.
func allowedOnDevice(ctx *modules.Context) bool {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"ufw", "status"}, Timeout: ufwTimeout})
	if err != nil {
		return false
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 4 && fields[0] == "Anywhere" && fields[1] == "on" && fields[2] == device && fields[3] == "ALLOW" {
			return true
		}
	}

	return false
}

func repository(release string) []byte {
	return []byte("deb [signed-by=" + keyringPath + "] https://pkgs.tailscale.com/stable/ubuntu " + release + " main\n")
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
