package ufw_test

import (
	"slices"
	"testing"

	"pupitre.studio/agent/internal/modules/modtest"
	"pupitre.studio/agent/internal/sys/ufw"
)

func TestCommentedReadsBackOnlyTheRulesAModuleTagged(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.Answer("ufw show added", "Added user rules (see 'ufw status' for running firewall):\n"+
		"ufw allow 22/tcp comment 'ssh'\n"+
		"ufw allow 80/tcp comment 'caddy'\n"+
		"ufw allow 443/tcp comment 'caddy'\n"+
		"ufw allow 443/tcp\n"+
		"ufw allow in on tailscale0 comment 'tailscale'\n")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if got := ufw.Commented(ctx, "caddy"); !slices.Equal(got, []string{"80/tcp", "443/tcp"}) {
		t.Fatalf("caddy rules = %v", got)
	}

	if got := ufw.Added(ctx); len(got) != 5 || got[4] != "ufw allow in on tailscale0 comment 'tailscale'" {
		t.Fatalf("added = %v", got)
	}

	for _, call := range fake.Calls {
		if call.Timeout != ufw.Timeout {
			t.Fatalf("ufw call without its timeout: %v", call.Argv)
		}
	}
}

func TestAFirewallThatCannotBeReadHasNoRules(t *testing.T) {
	fake := modtest.NewFakeSys()
	fake.FailProgram("ufw", "ERROR: problem running iptables")
	ctx := modtest.NewContext(t, fake, modtest.Options{})

	if got := ufw.Added(ctx); got != nil {
		t.Fatalf("added = %v", got)
	}

	if _, err := ufw.Run(ctx, "allow", "80/tcp"); err == nil {
		t.Fatal("a refused command is an error")
	}
}
