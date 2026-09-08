package hardening

import (
	"fmt"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/modules"
	"pupitre.studio/agent/internal/sys"
	"pupitre.studio/agent/internal/sys/apt"
	"pupitre.studio/agent/internal/sys/file"
	"pupitre.studio/agent/internal/sys/systemd"
)

const (
	User         = "dev"
	FragmentPath = "/etc/ssh/sshd_config.d/10-pupitre.conf"
	PreparedPath = "/etc/pupitre/sshd.conf"
	preparedDir  = "/etc/pupitre"
	jailPath     = "/etc/fail2ban/jail.d/pupitre.local"
	jailUnit     = "fail2ban"
	sshPort      = "22/tcp"
	altPort      = "443/tcp"
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

	if err := configureFirewall(ctx); err != nil {
		return err
	}

	if err := ctx.Step("write-fail2ban-jail", func() (modules.Outcome, error) {
		content := jail(ctx.Bool("ssh_443"))
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

	return ctx.Step("prepare-sshd-fragment", func() (modules.Outcome, error) {
		content := Fragment(options(ctx))
		if file.Same(ctx, PreparedPath, content) {
			return modules.Skipped, nil
		}

		if err := ctx.Sys().MkdirAll(preparedDir, 0o700); err != nil {
			return modules.Failed, err
		}

		return modules.Done, file.WriteAtomic(ctx, PreparedPath, content, 0o600)
	})
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
		removed, err := file.Remove(ctx, FragmentPath)
		if err != nil {
			return modules.Failed, err
		}

		if !removed {
			return modules.Skipped, nil
		}

		return modules.Done, reloadSSHD(ctx)
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

	return ctx.Step("disable-firewall", func() (modules.Outcome, error) {
		if !firewallStatus(ctx).active {
			return modules.Skipped, nil
		}

		_, err := ufw(ctx, "--force", "disable")

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
	status.Port = 22

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

func jail(ssh443 bool) []byte {
	ports := "22"
	if ssh443 {
		ports = "22,443"
	}

	return []byte(fmt.Sprintf(jailTemplate, ports))
}

func wantedPorts(ssh443 bool) []string {
	if ssh443 {
		return []string{sshPort, altPort}
	}

	return []string{sshPort}
}

func configureFirewall(ctx *modules.Context) error {
	return ctx.Step("configure-firewall", func() (modules.Outcome, error) {
		wanted := wantedPorts(ctx.Bool("ssh_443"))
		status := firewallStatus(ctx)
		if status.matches(wanted) {
			return modules.Skipped, nil
		}

		commands := [][]string{
			{"--force", "default", "deny", "incoming"},
			{"--force", "default", "allow", "outgoing"},
		}
		for _, port := range wanted {
			commands = append(commands, []string{"allow", port, "comment", "ssh"})
		}
		if !ctx.Bool("ssh_443") && status.allows(altPort) {
			commands = append(commands, []string{"delete", "allow", altPort})
		}
		if !status.active {
			commands = append(commands, []string{"--force", "enable"})
		}

		for _, argv := range commands {
			if _, err := ufw(ctx, argv...); err != nil {
				return modules.Failed, err
			}
		}

		return modules.Done, nil
	})
}

type firewall struct {
	active   bool
	incoming string
	outgoing string
	rules    []string
}

func firewallStatus(ctx *modules.Context) firewall {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"ufw", "status", "verbose"}})
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

func (f firewall) allows(port string) bool {
	for _, rule := range f.rules {
		if rule == port {
			return true
		}
	}

	return false
}

func (f firewall) matches(wanted []string) bool {
	if !f.active || f.incoming != "deny" || f.outgoing != "allow" {
		return false
	}

	for _, port := range wanted {
		if !f.allows(port) {
			return false
		}
	}

	return len(wanted) > 1 || !f.allows(altPort)
}

func ufw(ctx *modules.Context, args ...string) (sys.Output, error) {
	return sys.Exec(ctx, sys.Command{Argv: append([]string{"ufw"}, args...)})
}
