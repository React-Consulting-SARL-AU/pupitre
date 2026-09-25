package contract

import "slices"

var limitedCommands = Enum("LimitedCommands")

// RequiresPrivilege says what `pupitred serve` refuses without --privileged, the session sudo opens for dev without a password.
func RequiresPrivilege(cmd string, params any) bool {
	if !slices.Contains(limitedCommands, cmd) {
		return true
	}

	object, _ := params.(map[string]any)
	downgrade, _ := object["allow_downgrade"].(bool)

	return cmd == "agent.upgrade" && downgrade
}
