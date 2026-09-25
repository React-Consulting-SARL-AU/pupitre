package hardening

import (
	"errors"
	"fmt"
	"io/fs"
	"maps"
	"slices"
	"strconv"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
	"pupitre.studio/agent/internal/sys/ufw"
)

const (
	User         = "dev"
	FragmentPath = "/etc/ssh/sshd_config.d/10-pupitre.conf"
	PreparedPath = "/etc/pupitre/sshd.conf"
	preparedDir  = "/etc/pupitre"
	jailPath     = "/etc/fail2ban/jail.d/pupitre.local"
	jailUnit     = "fail2ban"
	sshSocket    = "ssh.socket"
	sshPort      = 22
	altPort      = 443
	comment      = "ssh"
)

var Packages = []string{"ufw", "fail2ban", "python3-systemd"}

const fragmentTemplate = `PermitRootLogin %s
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers %s
ClientAliveInterval 30
ClientAliveCountMax 6
`

// rsyslog is absent on Ubuntu 24.04, so the sshd jail must read the journal rather than /var/log/auth.log.
const jailTemplate = `[sshd]
enabled = true
backend = systemd
port = %s
maxretry = 5
findtime = 10m
bantime = 1h
`

// What the owner chose for SSH: the alternate port, and whether root keeps a way in.
type Options struct {
	SSH443   bool
	KeepRoot bool
}

func options(ctx *modules.Context) Options {
	return Options{SSH443: ctx.Bool("ssh_443"), KeepRoot: ctx.Bool("keep_root")}
}

type Module struct{}

func init() {
	modules.Register(Module{})
}

func (Module) Manifest() contract.Manifest {
	return manifest()
}

func (Module) Check(ctx *modules.Context) (modules.Status, error) {
	if len(apt.Missing(ctx, Packages...)) > 0 {
		return modules.Status{}, nil
	}

	version, err := apt.Version(ctx, "fail2ban")
	if err != nil {
		return modules.Status{}, err
	}

	return modules.Status{Installed: true, Version: version, Configured: file.Exists(ctx, PreparedPath)}, nil
}

func (Module) Install(ctx *modules.Context) error {
	return ctx.Step("install-packages", func() (modules.Outcome, error) {
		missing := apt.Missing(ctx, Packages...)
		if len(missing) == 0 {
			return modules.Skipped, nil
		}

		return modules.Done, apt.Install(ctx, missing...)
	})
}

func (Module) Configure(ctx *modules.Context) error {
	jailChanged := false

	ports, err := configureFirewall(ctx)
	if err != nil {
		return err
	}

	if err := ctx.Step("write-fail2ban-jail", func() (modules.Outcome, error) {
		content := jail(ports)
		if file.Same(ctx, jailPath, content) {
			return modules.Skipped, nil
		}

		jailChanged = true

		return modules.Done, file.WriteAtomic(ctx, jailPath, content, 0o644)
	}); err != nil {
		return err
	}

	if err := ctx.Step("enable-fail2ban", func() (modules.Outcome, error) {
		if !systemd.Active(ctx, jailUnit) {
			return modules.Done, systemd.Enable(ctx, jailUnit)
		}

		if !jailChanged {
			return modules.Skipped, nil
		}

		return modules.Done, systemd.Reload(ctx, jailUnit)
	}); err != nil {
		return err
	}

	if err := protectLinks(ctx); err != nil {
		return err
	}

	if err := ctx.Step("prepare-sshd-fragment", func() (modules.Outcome, error) {
		content := Fragment(options(ctx))
		if file.Same(ctx, PreparedPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(preparedDir, 0o700); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, PreparedPath, content, 0o600)
	}); err != nil {
		return err
	}

	return applyFragment(ctx)
}

// A machine already hardened runs on the live fragment: a form applied after
// harden reaches sshd through the same gate — write, validate, reload, confirm,
// or put the previous fragment back. Before harden, sshd is left alone, and
// root is never closed here: a live fragment that lets root in keeps letting
// it in until the harden command, the only one that checks a key opens dev
// before closing the door.
func applyFragment(ctx *modules.Context) error {
	if !file.Exists(ctx, FragmentPath) || file.Same(ctx, FragmentPath, Fragment(options(ctx))) {
		return nil
	}

	if !options(ctx).KeepRoot && rootOpenIn(ctx) {
		return ctx.Step("keep-sshd-fragment", func() (modules.Outcome, error) {
			ctx.Warn(i18n.T("warn.hardening.root_stays_open"))

			return modules.Skipped, nil
		})
	}

	if result := Harden(ctx); result.Reason != "" {
		return errors.New(result.Reason)
	}

	return nil
}

func rootOpenIn(ctx *modules.Context) bool {
	live, err := file.Read(ctx, FragmentPath)
	if err != nil {
		return true
	}

	for _, line := range strings.Split(string(live), "\n") {
		if directive, value, found := strings.Cut(strings.TrimSpace(line), " "); found && strings.EqualFold(directive, "PermitRootLogin") {
			return strings.TrimSpace(value) != "no"
		}
	}

	return true
}

func (m Module) Upgrade(ctx *modules.Context) error {
	if err := ctx.Step("upgrade-packages", func() (modules.Outcome, error) {
		outcome := modules.Skipped
		for _, pkg := range Packages {
			upgraded, err := apt.Upgrade(ctx, pkg)
			if err != nil {
				return modules.Failed, err
			}

			if upgraded {
				outcome = modules.Done
			}
		}

		return outcome, nil
	}); err != nil {
		return err
	}

	return m.Configure(ctx)
}

func (Module) Uninstall(ctx *modules.Context) error {
	if err := ctx.Step("reopen-sshd", func() (modules.Outcome, error) {
		previous, err := file.Read(ctx, FragmentPath)
		if errors.Is(err, fs.ErrNotExist) {
			return modules.Skipped, nil
		}
		if err != nil {
			return modules.Failed, err
		}

		if _, err := file.Remove(ctx, FragmentPath); err != nil {
			return modules.Failed, err
		}

		if _, err := sys.Exec(ctx, sys.Command{Argv: []string{"sshd", "-t"}}); err != nil {
			return modules.Failed, errors.Join(err, file.WriteAtomic(ctx, FragmentPath, previous, 0o644))
		}

		if err := reloadSSHD(ctx); err != nil {
			return modules.Failed, errors.Join(err, file.WriteAtomic(ctx, FragmentPath, previous, 0o644))
		}

		return modules.Done, nil
	}); err != nil {
		return err
	}

	if err := ctx.Step("remove-prepared-fragment", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, PreparedPath)
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

	if err := ctx.Step("remove-fail2ban-jail", func() (modules.Outcome, error) {
		removed, err := file.Remove(ctx, jailPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		if !systemd.Active(ctx, jailUnit) {
			return modules.Done, nil
		}

		return modules.Done, systemd.Reload(ctx, jailUnit)
	}); err != nil {
		return err
	}

	if err := removeLinksSysctl(ctx); err != nil {
		return err
	}

	return ctx.Step("disable-firewall", func() (modules.Outcome, error) {
		if !firewallStatus(ctx).active {
			return modules.Skipped, nil
		}

		_, err := ufw.Run(ctx, "--force", "disable")

		return modules.Done, err
	})
}

func (m Module) Status(ctx *modules.Context) (modules.Status, error) {
	status, err := m.Check(ctx)
	if err != nil {
		return modules.Status{}, err
	}

	status.State = systemd.State(ctx, jailUnit)
	status.Unit = jailUnit
	status.Port = sshPort

	return status, nil
}

func Fragment(o Options) []byte {
	rootLogin, allowed := "no", User
	if o.KeepRoot {
		rootLogin, allowed = "prohibit-password", User+" root"
	}

	content := fmt.Sprintf(fragmentTemplate, rootLogin, allowed)
	if o.SSH443 {
		content += "Port 22\nPort 443\n"
	}

	return []byte(content)
}

func jail(ports []int) []byte {
	listed := make([]string, 0, len(ports))
	for _, port := range ports {
		listed = append(listed, strconv.Itoa(port))
	}

	return []byte(fmt.Sprintf(jailTemplate, strings.Join(listed, ",")))
}

func rule(port int) string {
	return strconv.Itoa(port) + "/tcp"
}

// Every port is allowed before the default turns to deny, and the firewall comes up last: at no moment does it stand between the owner and sshd.
func configureFirewall(ctx *modules.Context) ([]int, error) {
	var wanted []int

	err := ctx.Step("configure-firewall", func() (modules.Outcome, error) {
		ports, err := wantedPorts(ctx)
		if err != nil {
			return modules.Failed, errors.New(i18n.T("harden.ports.unreadable", message(err)))
		}

		wanted = ports
		status := firewallStatus(ctx)
		if status.matches(wanted) {
			return modules.Skipped, nil
		}

		var commands [][]string
		for _, port := range wanted {
			commands = append(commands, []string{"allow", rule(port), "comment", comment})
		}
		commands = append(commands,
			[]string{"--force", "default", "deny", "incoming"},
			[]string{"--force", "default", "allow", "outgoing"},
		)
		if status.stale(wanted) {
			commands = append(commands, []string{"delete", "allow", rule(altPort)})
		}
		if !status.active {
			commands = append(commands, []string{"--force", "enable"})
		}

		for _, argv := range commands {
			if _, err := ufw.Run(ctx, argv...); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, nil
	})

	return wanted, err
}

// 443 that only the live fragment gave sshd goes with that fragment later in this same configure.
func wantedPorts(ctx *modules.Context) ([]int, error) {
	listened, err := listenedPorts(ctx)
	if err != nil {
		return nil, err
	}

	ssh443 := ctx.Bool("ssh_443")
	if !ssh443 && liveFragmentOpens(ctx, altPort) {
		delete(listened, altPort)
	}

	if ssh443 {
		listened[sshPort], listened[altPort] = true, true
	}

	if len(listened) == 0 {
		listened[sshPort] = true
	}

	return slices.Sorted(maps.Keys(listened)), nil
}

// A ListenAddress may carry its own port, and from Ubuntu 22.10 ssh.socket may listen where sshd_config never said.
func listenedPorts(ctx *modules.Context) (map[int]bool, error) {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"sshd", "-T"}})
	if err != nil {
		return nil, err
	}

	effective := effectiveConfig(out.Stdout)
	ports := map[int]bool{}
	for _, value := range append(effective["port"], effective["listenaddress"]...) {
		if port, ok := portOf(value); ok {
			ports[port] = true
		}
	}

	if systemd.Active(ctx, sshSocket) {
		listen, err := ctx.Sys().Run(sys.Command{Argv: []string{"systemctl", "show", sshSocket, "--property=Listen", "--value"}})
		if err != nil {
			return nil, err
		}

		for _, value := range strings.Fields(listen.Stdout) {
			if port, ok := portOf(value); ok {
				ports[port] = true
			}
		}
	}

	ctx.Logf("sshd listens on %v", slices.Sorted(maps.Keys(ports)))

	return ports, nil
}

func portOf(value string) (int, bool) {
	if colon := strings.LastIndex(value, ":"); colon >= 0 {
		value = value[colon+1:]
	}

	port, err := strconv.Atoi(value)

	return port, err == nil && port > 0 && port < 65536
}

func liveFragmentOpens(ctx *modules.Context, port int) bool {
	live, err := file.Read(ctx, FragmentPath)
	if err != nil {
		return false
	}

	for _, line := range strings.Split(string(live), "\n") {
		if directive, value, found := strings.Cut(strings.TrimSpace(line), " "); found && strings.EqualFold(directive, "Port") && strings.TrimSpace(value) == strconv.Itoa(port) {
			return true
		}
	}

	return false
}

type firewall struct {
	active   bool
	incoming string
	outgoing string
	rules    []string
	// The rules the hardening added itself, read back by their comment: 443 is
	// also Caddy's, and Caddy's rule is Caddy's to close.
	owned []string
}

func firewallStatus(ctx *modules.Context) firewall {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"ufw", "status", "verbose"}, Timeout: ufw.Timeout})
	if err != nil {
		return firewall{}
	}

	var status firewall
	for _, line := range strings.Split(out.Stdout, "\n") {
		fields := strings.Fields(line)
		switch {
		case strings.HasPrefix(line, "Status:"):
			status.active = strings.TrimSpace(strings.TrimPrefix(line, "Status:")) == "active"
		case strings.HasPrefix(line, "Default:"):
			status.incoming, status.outgoing = defaultPolicies(line)
		case len(fields) >= 3 && fields[1] == "ALLOW" && fields[2] == "IN" && !strings.Contains(line, "(v6)"):
			status.rules = append(status.rules, fields[0])
		}
	}

	status.owned = ufw.Commented(ctx, comment)

	return status
}

func defaultPolicies(line string) (incoming, outgoing string) {
	for _, part := range strings.Split(strings.TrimPrefix(line, "Default:"), ",") {
		policy, target, ok := strings.Cut(strings.TrimSpace(part), " ")
		if !ok {
			continue
		}

		switch strings.Trim(target, "()") {
		case "incoming":
			incoming = policy
		case "outgoing":
			outgoing = policy
		}
	}

	return incoming, outgoing
}

func (f firewall) allows(port int) bool {
	return slices.Contains(f.rules, rule(port))
}

// Only 443 is ever closed here, and only the rule the hardening added: a port sshd may still listen on stays open.
func (f firewall) stale(wanted []int) bool {
	return slices.Contains(f.owned, rule(altPort)) && !slices.Contains(wanted, altPort)
}

func (f firewall) matches(wanted []int) bool {
	if !f.active || f.incoming != "deny" || f.outgoing != "allow" {
		return false
	}

	for _, port := range wanted {
		if !f.allows(port) {
			return false
		}
	}

	return !f.stale(wanted)
}
