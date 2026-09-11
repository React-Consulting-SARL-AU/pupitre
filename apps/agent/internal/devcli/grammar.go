// Package devcli holds the driving commands as a human types them : the grammar of `pupitred dev`, and the renderer that turns a protocol answer into lines on a terminal.
package devcli

import (
	"fmt"
	"strings"

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

// The arguments of each verb, as a terminal takes them. The grammar above
// describes what the app completes, which knows nothing of `-n` nor of a second
// positional; the placeholders stay in English, the sentence beside them comes
// from the catalogue.
var forms = map[string]string{
	"up":      "<project|all>",
	"down":    "<project|all>",
	"restart": "<project|all>",
	"logs":    "<project> [-f] [-n N]",
	"sync":    "<project>",
	"attach":  "<project>",
	"branch":  "[project] [branch]",
	"db":      "<url|shell|dump|import> [engine]",
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
