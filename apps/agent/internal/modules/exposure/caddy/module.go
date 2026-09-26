package caddy

import (
	"errors"
	"maps"
	"slices"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/i18n"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/modules/exposure/routes"
	"pupitre.studio/agent/internal/protocol"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/env"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/ufw"
)

const (
	Unit = "caddy"

	// Tags this module's firewall rules apart from the client's own.
	comment = "caddy"

	Provider = "caddy"

	DefaultHTTPPort  = 80
	DefaultHTTPSPort = 443

	pkg = "caddy"

	keyURL      = "https://dl.cloudsmith.io/public/caddy/stable/gpg.key"
	keyringDir  = "/etc/apt/keyrings"
	keyringPath = keyringDir + "/caddy-stable.asc"
	sourcePath  = "/etc/apt/sources.list.d/caddy-stable.list"
	sourceLine  = "deb [signed-by=" + keyringPath + "] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main\n"

	configDir     = "/etc/caddy"
	configPath    = configDir + "/Caddyfile"
	candidatePath = configDir + "/.Caddyfile.pupitre"
	modePath      = routes.ModePath

	portsKey = "CADDY_PORTS"
)

var mode = routes.Marker(Provider)

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Preflight(ctx *modules.Context) []contract.FieldProblem {
	return modules.Problems(
		modules.PortTaken(ctx, "http_port"),
		modules.PortTaken(ctx, "https_port"),
	)
}

// A caddy the client installed for something else is not ours: the exposure marker decides.
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

// Ubuntu's own caddy trails upstream by a long way, hence Caddy's repository.
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

		return modules.Done, apt.RefreshAdded(ctx, sourcePath, keyringPath)
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

// Mode and domain come before the Caddyfile: the registry resolves the routes against the stored domain.
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

// An identical Caddyfile is still validated: an upgraded Caddy may refuse what the previous version took.
func writeCaddyfile(ctx *modules.Context) (bool, error) {
	content := render(ctx)
	changed := false
	refused := false

	err := ctx.Step("write-caddyfile", func() (modules.Outcome, error) {
		if file.Same(ctx, configPath, content) {
			if err := validate(ctx, configPath); err != nil {
				refused = true

				return modules.Failed, err
			}

			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(configDir, 0o755); err != nil {
			return modules.Failed, err
		}

		if err := file.WriteAtomic(ctx, candidatePath, content, 0o644); err != nil {
			return modules.Failed, err
		}
		defer file.Remove(ctx, candidatePath)

		if err := validate(ctx, candidatePath); err != nil {
			refused = true

			return modules.Failed, err
		}

		changed = true

		return modules.Done, file.WriteAtomic(ctx, configPath, content, 0o644)
	})

	var step *modules.StepError
	if refused && errors.As(err, &step) {
		return false, protocol.NewError(contract.ErrorBadRequest, step.Message).WithFix(i18n.T("modules.caddy.invalid.fix"))
	}

	return changed, err
}

// Rules are <port>/tcp with the module's comment, kept apart from core.hardening's bare 22 and 443.
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
			if _, err := ufw.Run(ctx, "delete", "allow", rule); err != nil {
				ctx.Warn(i18n.T("warn.caddy.ufw.refused", rule))

				return modules.Done, nil
			}
		}

		for _, rule := range missing {
			if _, err := ufw.Run(ctx, "allow", rule, "comment", comment); err != nil {
				ctx.Warn(i18n.T("warn.caddy.ufw.refused", rule))

				return modules.Done, nil
			}
		}

		return modules.Done, nil
	})
}

func declareMode(ctx *modules.Context) error {
	if err := routes.DeclareMode(ctx, Provider); err != nil {
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

// A reload keeps certificates and open connections; only a changed Caddyfile is worth one.
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

// systemctl reload leaves the reason in Caddy's journal; caddy validate brings it into the step.
func validate(ctx *modules.Context, path string) error {
	out, err := sys.Exec(ctx, sys.Command{Argv: []string{"caddy", "validate", "--config", path, "--adapter", "caddyfile"}})
	if err != nil {
		return errors.New(i18n.T("modules.caddy.invalid", configPath, strings.ReplaceAll(strings.TrimSpace(out.Stderr+"\n"+out.Stdout), candidatePath, configPath)))
	}

	return nil
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

// Certificates under /var/lib/caddy belong to the client's domain and are left in place.
func (Module) Uninstall(ctx *modules.Context) error {
	heldByAnother := routes.HeldByAnother(ctx, Provider)

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
			if _, err := ufw.Run(ctx, "delete", "allow", rule); err != nil {
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

		paths := []string{sourcePath}
		if file.Same(ctx, modePath, mode) {
			paths = append(paths, modePath)
		}

		for _, path := range paths {
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

		keys := []string{portsKey}
		if !heldByAnother {
			keys = append(keys, env.DomainKey)
		}

		for _, key := range keys {
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
	return caddyfile(ctx.String("email"), httpPort(ctx), httpsPort(ctx), routes.Published(ctx, domainOf(ctx)))
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

// Falls back to /etc/pupitre/env: a command runs long after the install, without its configuration.
func domainOf(ctx *modules.Context) string {
	if domain := ctx.String("domain"); domain != "" {
		return domain
	}

	domain, _, _ := env.Get(ctx, env.DomainKey)

	return domain
}

// Read by comment whether ufw is up or not: the hardening may come after this module.
func owned(ctx *modules.Context) map[string]bool {
	rules := map[string]bool{}

	for _, rule := range ufw.Commented(ctx, comment) {
		rules[rule] = true
	}

	return rules
}

func sortedRules(rules map[string]bool) []string {
	sorted := slices.Collect(maps.Keys(rules))
	slices.Sort(sorted)

	return sorted
}
