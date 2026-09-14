package caddy

import (
	"maps"
	"slices"
	"strconv"
	"strings"
	"time"

	"pupitre.studio/agent/internal/i18n"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	Unit = "caddy"

	// The comment every firewall rule of this module carries: what tells its ports apart from the client's own.
	comment = "caddy"

	// Provider is the one name this module answers to: the marker on disk, and the name its report carries.
	Provider = "caddy"

	DefaultHTTPPort  = 80
	DefaultHTTPSPort = 443

	pkg = "caddy"

	keyURL      = "https://dl.cloudsmith.io/public/caddy/stable/gpg.key"
	keyringDir  = "/etc/apt/keyrings"
	keyringPath = keyringDir + "/caddy-stable.asc"
	sourcePath  = "/etc/apt/sources.list.d/caddy-stable.list"
	sourceLine  = "deb [signed-by=" + keyringPath + "] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main\n"

	configPath = "/etc/caddy/Caddyfile"
	modePath   = routes.ModePath

	portsKey = "CADDY_PORTS"
)

var mode = []byte(Provider + "\n")

// ufw rewrites the whole rule set through iptables and can sit there for ever on a kernel that refuses it; a minute is more than it ever needs.
const ufwTimeout = time.Minute

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

// Both doors are on the public side of this machine: one already held means no certificate and no project served.
func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(
		modules.PortTaken(ctx, "http_port"),
		modules.PortTaken(ctx, "https_port"),
	)
}

// The package alone is not this module: the marker says which exposure holds the machine, and a caddy the client put there for something else is not ours to report or to sync.
func ours(ctx *modules.Context) bool {
	return apt.Installed(ctx, pkg) && file.Same(ctx, modePath, mode)
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if !ours(ctx) {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, pkg)
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, configPath)}, nil
}

// Ubuntu's own caddy trails the project by a long way: the module adds Caddy's repository, key first.
func (Module) Install(ctx *modules.Context) error {
	if err := ctx.Step("add-repository", func() (modules.Outcome, error) {
		if file.Exists(ctx, keyringPath) && file.Same(ctx, sourcePath, []byte(sourceLine)) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(keyringDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if err := apt.DownloadKey(ctx, keyURL, keyringPath); err != nil {
			return modules.Failed, err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"chmod", "0644", keyringPath}}); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, sourcePath, []byte(sourceLine), 0o644); err != nil {
			return modules.Failed, err
		}

		return modules.Done, apt.Refresh(ctx)
	}); err != nil {
		return err
	}

	return ctx.Step("install-caddy", func() (modules.Outcome, error) {
		if apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, pkg)
	})
}

// The mode and the domain are declared before the Caddyfile is written: the registry resolves the routes of the repository's rows against the domain.
func (Module) Configure(ctx *modules.Context) error {
	if err := routes.MoveRoutes(ctx); err != nil {
		return err
	}

	if err := declareMode(ctx); err != nil {
		return err
	}

	changed, err := writeCaddyfile(ctx)
	if err != nil {
		return err
	}

	if err := syncFirewall(ctx); err != nil {
		return err
	}

	return reload(ctx, changed)
}

func writeCaddyfile(ctx *modules.Context) (bool, error) {
	content := render(ctx)
	changed := false

	err := ctx.Step("write-caddyfile", func() (modules.Outcome, error) {
		if file.Same(ctx, configPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll("/etc/caddy", 0o755); err != nil {
			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, configPath, content, 0o644)
	})

	return changed, err
}

// The rules are written as <port>/tcp and carry the module's name: core.hardening owns the bare 22 and 443 of SSH, and never touches these.
// A port the client moved away from is closed on the same pass, so the firewall only ever opens what the Caddyfile serves.
func syncFirewall(ctx *modules.Context) error {
	return ctx.Step("sync-firewall", func() (modules.Outcome, error) {
		wanted := wantedRules(ctx)
		opened := owned(ctx)

		var stale []string
		for _, rule := range sortedRules(opened) {
			if !slices.Contains(wanted, rule) {
				stale = append(stale, rule)
			}
		}

		var missing []string
		for _, rule := range wanted {
			if !opened[rule] {
				missing = append(missing, rule)
			}
		}

		if len(stale) == 0 && len(missing) == 0 {
			return modules.Skipped, nil
		}

		for _, rule := range stale {
			if _, err := ufw(ctx, "delete", "allow", rule); err != nil {
				ctx.Warn(i18n.T("warn.caddy.ufw.refused", rule))

				return modules.Done, nil
			}
		}

		for _, rule := range missing {
			if _, err := ufw(ctx, "allow", rule, "comment", comment); err != nil {
				ctx.Warn(i18n.T("warn.caddy.ufw.refused", rule))

				return modules.Done, nil
			}
		}

		return modules.Done, nil
	})
}

func declareMode(ctx *modules.Context) error {
	if err := ctx.Step("declare-mode", func() (modules.Outcome, error) {
		if file.Same(ctx, modePath, mode) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll("/etc/pupitre", 0o700); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, modePath, mode, 0o644)
	}); err != nil {
		return err
	}

	return ctx.Step("store-domain", func() (modules.Outcome, error) {
		stored := false

		values := map[string]string{
			env.DomainKey: ctx.String("domain"),
			portsKey:      strconv.Itoa(httpPort(ctx)) + "," + strconv.Itoa(httpsPort(ctx)),
		}
		for key, value := range values {
			changed, err := env.Set(ctx, key, value)
			if err != nil {
				return modules.Failed, err
			}

			stored = stored || changed
		}

		if !stored {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	})
}

// A reload keeps the certificates and the open connections; only a Caddyfile that changed is worth one.
func reload(ctx *modules.Context, changed bool) error {
	return ctx.Step("enable-service", func() (modules.Outcome, error) {
		if systemd.Active(ctx, Unit) && !changed {
			return modules.Skipped, nil
		}

		if err := systemd.Enable(ctx, Unit); err != nil {
			return modules.Failed, err
		}

		if systemd.Active(ctx, Unit) {
			return modules.Done, systemd.Reload(ctx, Unit)
		}

		return modules.Done, systemd.Restart(ctx, Unit)
	})
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-caddy", func() (modules.Outcome, error) {
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

// The certificates Caddy obtained live under /var/lib/caddy and belong to the client's domain, not to this module.
func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("stop-service", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, Unit) {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Disable(ctx, Unit)
	}); err != nil {
		return err
	}

	if err := ctx.Step("close-firewall", func() (modules.Outcome, error) {
		closed := false

		for _, rule := range sortedRules(owned(ctx)) {
			if _, err := ufw(ctx, "delete", "allow", rule); err != nil {
				continue
			}

			closed = true
		}

		if !closed {
			return modules.Skipped, nil
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-caddy", func() (modules.Outcome, error) {
		if !apt.Installed(ctx, pkg) {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Remove(ctx, pkg)
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-config", func() (modules.Outcome, error) {
		cleared := false

		for _, path := range []string{sourcePath, modePath} {
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
	}); err != nil {
		return err
	}

	return ctx.Step("forget-domain", func() (modules.Outcome, error) {
		forgotten := false

		for _, key := range []string{env.DomainKey, portsKey} {
			removed, err := env.Unset(ctx, key)
			if err != nil {
				return modules.Failed, err
			}

			forgotten = forgotten || removed
		}

		if !forgotten {
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
	status.Port = httpsPort(ctx)
	status.Credentials = map[string]string{i18n.T("module.exposure.caddy.credential.domain.label"): env.DomainKey}

	return status, nil
}

func render(ctx *modules.Context) []byte {
	return caddyfile(ctx.String("email"), httpPort(ctx), httpsPort(ctx), domainOf(ctx), routes.Declared(ctx))
}

func wantedRules(ctx *modules.Context) []string {
	return []string{strconv.Itoa(httpPort(ctx)) + "/tcp", strconv.Itoa(httpsPort(ctx)) + "/tcp"}
}

func httpPort(ctx *modules.Context) int {
	return portOr(ctx, "http_port", DefaultHTTPPort)
}

func httpsPort(ctx *modules.Context) int {
	return portOr(ctx, "https_port", DefaultHTTPSPort)
}

func portOr(ctx *modules.Context, key string, fallback int) int {
	if chosen := ctx.Int(key); chosen > 0 {
		return chosen
	}

	return fallback
}

// The configured value first, then the one the configuration left in /etc/pupitre/env: a command runs long after the install.
func domainOf(ctx *modules.Context) string {
	if domain := ctx.String("domain"); domain != "" {
		return domain
	}

	domain, _, _ := env.Get(ctx, env.DomainKey)

	return domain
}

func ufw(ctx *modules.Context, args ...string) (sys.Output, error) {
	return sys.Exec(ctx, sys.Command{Argv: append([]string{"ufw"}, args...), Timeout: ufwTimeout})
}

// ufw show added lists the rules as they were given, comment included, whether the firewall is up yet or not: the hardening may come after this module.
func owned(ctx *modules.Context) map[string]bool {
	rules := map[string]bool{}

	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"ufw", "show", "added"}, Timeout: ufwTimeout})
	if err != nil {
		return rules
	}

	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		if len(fields) == 5 && fields[0] == "ufw" && fields[1] == "allow" && fields[3] == "comment" && fields[4] == "'"+comment+"'" {
			rules[fields[2]] = true
		}
	}

	return rules
}

func sortedRules(rules map[string]bool) []string {
	sorted := slices.Collect(maps.Keys(rules))
	slices.Sort(sorted)

	return sorted
}
