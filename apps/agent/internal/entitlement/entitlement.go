package entitlement

import "pupitre.studio/agent/internal/contract"

var RestrictedCommands = []string{"hello", "ping", "snapshot", "status", "diag", "agent.upgrade"}

func Current() contract.Entitlement {
	return buildEntitlement
}

func AllowedInRestrictedMode(cmd string) bool {
	for _, allowed := range RestrictedCommands {
		if allowed == cmd {
			return true
		}
	}

	return false
}
