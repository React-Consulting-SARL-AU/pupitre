package contract

import "slices"

var limitedCommands = Enum("LimitedCommands")

// What `pupitred serve` refuses without --privileged, the session sudo opens for dev without a password.
// An agent running as dev must not open a project to the web on its own.
func RequiresPrivilege(cmd string, params any) bool {
	if !slices.Contains(limitedCommands, cmd) {
		return true
	}

	object, _ := params.(map[string]any)

	switch cmd {
	case "project.add":
		return unprotects(object)
	case "project.update":
		return unprotects(object["patch"])
	}

	downgrade, _ := object["allow_downgrade"].(bool)

	return cmd == "agent.upgrade" && downgrade
}

func unprotects(value any) bool {
	object, _ := value.(map[string]any)
	if object == nil {
		return false
	}

	if protected, named := object["protected"].(bool); named && !protected {
		return true
	}

	processes, _ := object["processes"].([]any)

	return slices.ContainsFunc(processes, unprotects)
}
