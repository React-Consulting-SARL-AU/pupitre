// Package ufw drives the firewall every module shares, each rule tagged with the comment of the module that added it.
package ufw

import (
	"strings"
	"time"

	"pupitre.studio/agent/internal/sys"
)

// ufw rewrites the whole rule set through iptables and can sit there for ever on a kernel that refuses it; a minute is more than it ever needs.
const Timeout = time.Minute

func Run(ctx sys.Context, args ...string) (sys.Output, error) {
	return sys.Exec(ctx, sys.Command{Argv: append([]string{"ufw"}, args...), Timeout: Timeout})
}

// Added is what ufw show added lists, one rule per line as it was given, comment included, whether the firewall is up yet or not.
func Added(ctx sys.Context) []string {
	out, err := ctx.Sys().Run(sys.Command{Argv: []string{"ufw", "show", "added"}, Timeout: Timeout})
	if err != nil {
		return nil
	}

	var rules []string
	for _, line := range strings.Split(out.Stdout, "\n") {
		if rule := strings.TrimSpace(line); strings.HasPrefix(rule, "ufw ") {
			rules = append(rules, rule)
		}
	}

	return rules
}

// Commented lists the ports of the allow rules that carry comment: "ufw allow 443/tcp comment 'caddy'" answers 443/tcp for caddy.
func Commented(ctx sys.Context, comment string) []string {
	var ports []string
	for _, rule := range Added(ctx) {
		fields := strings.Fields(rule)
		if len(fields) == 5 && fields[1] == "allow" && fields[3] == "comment" && fields[4] == "'"+comment+"'" {
			ports = append(ports, fields[2])
		}
	}

	return ports
}
