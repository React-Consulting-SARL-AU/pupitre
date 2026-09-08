// Package devcli holds the driving commands as a human types them : the grammar of `pupitred dev`, and the renderer that turns a protocol answer into lines on a terminal.
package devcli

import (
	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const (
	// The name the grammar is typed under: /usr/local/bin/dev is a symlink to the agent, and pupitred dev answers the same.
	Command = "dev"

	// The app replaces it with the projects the same answer carries.
	ProjectToken = "$project"

	Binary = "/usr/local/bin/pupitred"
	Link   = "/usr/local/bin/" + Command

	JSONFlag   = "--json"
	FollowFlag = "-f"
)

func grammar() []contract.SubCommand {
	return []contract.SubCommand{
		{Name: "up", Help: i18n.T("devcli.up.help"), Args: [][]string{{ProjectToken, "all"}, {JSONFlag}}},
		{Name: "down", Help: i18n.T("devcli.down.help"), Args: [][]string{{ProjectToken, "all"}, {JSONFlag}}},
		{Name: "restart", Help: i18n.T("devcli.restart.help"), Args: [][]string{{ProjectToken, "all"}, {JSONFlag}}},
		{Name: "status", Help: i18n.T("devcli.status.help"), Args: [][]string{{JSONFlag}}},
		{Name: "logs", Help: i18n.T("devcli.logs.help"), Args: [][]string{{ProjectToken}, {FollowFlag, JSONFlag}}},
		{Name: "sync", Help: i18n.T("devcli.sync.help"), Args: [][]string{{ProjectToken}, {JSONFlag}}},
		{Name: "attach", Help: i18n.T("devcli.attach.help"), Args: [][]string{{ProjectToken}, {JSONFlag}}},
		{Name: "branch", Help: i18n.T("devcli.branch.help"), Args: [][]string{{ProjectToken}, {JSONFlag}}},
		{Name: "db", Help: i18n.T("devcli.db.help"), Args: [][]string{{"url", "shell", "dump", "import"}, {"mysql", "postgres", "mongodb"}, {JSONFlag}}},
		{Name: "doctor", Help: i18n.T("devcli.doctor.help"), Args: [][]string{{JSONFlag}}},
	}
}

func Grammar() []contract.SubCommand {
	return grammar()
}
