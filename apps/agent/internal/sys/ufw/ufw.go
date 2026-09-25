package ufw

import (
	"strings"
	"time"

	"pupitre.studio/agent/internal/sys"
)

// ufw rewrites every rule through iptables and can hang on a kernel that refuses it; a minute is ample.
const Timeout = time.Minute

func Run(ctx sys.Context, args ...string) (sys.Output, error) {
	return sys.Exec(ctx, sys.Command{Argv: append([]string{"ufw"}, args...), Timeout: Timeout})
}

// ufw show added lists the rules as given, comments included, even while the firewall is down.
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
