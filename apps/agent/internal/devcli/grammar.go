package devcli

import (
	"fmt"
	"strings"

	"pupitre.studio/agent/internal/contract"
	"pupitre.studio/agent/internal/i18n"
)

const (
	Command = "dev"

	// The app replaces it with the projects the same answer carries.
	ProjectToken = "$project"

	// The app replaces it with the processes of the project typed before it.
	ProcessToken = "$process"

	Binary = "/usr/local/bin/pupitred"
	Link   = "/usr/local/bin/" + Command

	JSONFlag   = "--json"
	FollowFlag = "-f"
)

func grammar() []contract.SubCommand {
	return []contract.SubCommand{
		{Name: "up", Help: i18n.T("devcli.up.help"), Args: [][]string{{ProjectToken, "all"}, {ProcessToken, JSONFlag}}},
		{Name: "down", Help: i18n.T("devcli.down.help"), Args: [][]string{{ProjectToken, "all"}, {ProcessToken, JSONFlag}}},
		{Name: "restart", Help: i18n.T("devcli.restart.help"), Args: [][]string{{ProjectToken, "all"}, {ProcessToken, JSONFlag}}},
		{Name: "status", Help: i18n.T("devcli.status.help"), Args: [][]string{{JSONFlag}}},
		{Name: "logs", Help: i18n.T("devcli.logs.help"), Args: [][]string{{ProjectToken}, {ProcessToken}, {FollowFlag, JSONFlag}}},
		{Name: "sync", Help: i18n.T("devcli.sync.help"), Args: [][]string{{ProjectToken}, {JSONFlag}}},
		{Name: "attach", Help: i18n.T("devcli.attach.help"), Args: [][]string{{ProjectToken}, {ProcessToken, JSONFlag}}},
		{Name: "branch", Help: i18n.T("devcli.branch.help"), Args: [][]string{{ProjectToken}, {JSONFlag}}},
		{Name: "db", Help: i18n.T("devcli.db.help"), Args: [][]string{{"url", "shell", "dump", "import"}, {"mysql", "postgres", "mongodb"}, {JSONFlag}}},
		{Name: "doctor", Help: i18n.T("devcli.doctor.help"), Args: [][]string{{JSONFlag}}},
		{Name: "backup", Help: i18n.T("devcli.backup.help"), Args: [][]string{{"now", "status"}, {JSONFlag}}},
	}
}

func Grammar() []contract.SubCommand {
	return grammar()
}

// The terminal's forms: the grammar the app completes knows nothing of `-n` nor of a second positional.
var forms = map[string]string{
	"up":      "<project|all> [process]",
	"down":    "<project|all> [process]",
	"restart": "<project|all> [process]",
	"logs":    "<project> <process> [-f] [-n N]",
	"sync":    "<project>",
	"attach":  "<project> [process]",
	"branch":  "[project] [branch]",
	"db":      "<url|shell|dump|import> [engine]",
	"backup":  "<now|status>",
}

func Usage() string {
	var lines strings.Builder

	fmt.Fprintf(&lines, "%s\n\n", i18n.T("devcli.usage"))

	for _, verb := range grammar() {
		fmt.Fprintf(&lines, "  %-35s %s\n", strings.TrimSpace(verb.Name+" "+forms[verb.Name]), verb.Help)
	}

	fmt.Fprintf(&lines, "\n%s\n", i18n.T("devcli.usage.json"))

	return lines.String()
}
