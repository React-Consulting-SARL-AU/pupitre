// Package devcli holds the driving commands as a human types them : the grammar of `pupitred dev`, and the renderer that turns a protocol answer into lines on a terminal.
package devcli

import "pupitre.studio/agent/internal/contract"

const (
	// The name the grammar is typed under: /usr/local/bin/dev is a symlink to the agent, and pupitred dev answers the same.
	Command = "dev"

	// The app replaces it with the projects the same answer carries.
	ProjectToken = "$project"

	JSONFlag   = "--json"
	FollowFlag = "-f"
)

var grammar = []contract.SubCommand{
	{Name: "up", Help: "démarre un projet", Args: [][]string{{ProjectToken, "all"}, {JSONFlag}}},
	{Name: "down", Help: "arrête un projet", Args: [][]string{{ProjectToken, "all"}, {JSONFlag}}},
	{Name: "restart", Help: "redémarre un projet", Args: [][]string{{ProjectToken, "all"}, {JSONFlag}}},
	{Name: "status", Help: "ce qui tourne, les ports, les services", Args: [][]string{{JSONFlag}}},
	{Name: "logs", Help: "les dernières lignes du journal d'un projet", Args: [][]string{{ProjectToken}, {FollowFlag, JSONFlag}}},
	{Name: "sync", Help: "git pull puis dépendances", Args: [][]string{{ProjectToken}, {JSONFlag}}},
	{Name: "attach", Help: "la commande tmux qui ouvre la fenêtre d'un projet", Args: [][]string{{ProjectToken}, {JSONFlag}}},
	{Name: "branch", Help: "la branche de chaque dépôt, ou change de branche", Args: [][]string{{ProjectToken}, {JSONFlag}}},
	{Name: "db", Help: "la base locale", Args: [][]string{{"url", "shell", "dump", "import"}, {"mysql", "postgres", "mongodb"}, {JSONFlag}}},
	{Name: "doctor", Help: "diagnostic court", Args: [][]string{{JSONFlag}}},
}

func Grammar() []contract.SubCommand {
	return append([]contract.SubCommand(nil), grammar...)
}
