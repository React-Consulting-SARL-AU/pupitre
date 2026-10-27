package i18n

var cliCatalog = map[string]Message{
	"cli.argument.unknown": {
		FR: "argument inconnu : %s",
		EN: "unknown argument: %s",
	},
	"cli.option.unknown": {
		FR: "option inconnue : %s",
		EN: "unknown option: %s",
	},
	"cli.port.unreadable": {
		FR: "port illisible : %s",
		EN: "unreadable port: %s",
	},
	"cli.install.unreadable": {
		FR: "%s illisible : %s",
		EN: "%s cannot be read: %s",
	},
	"cli.install.nothing": {
		FR: "aucun module à installer : %s est absent et --only n'est pas donné.",
		EN: "no module to install: %s is absent and --only is not given.",
	},
	"cli.install.nothing.fix": {
		FR: "Lancez l'installation depuis l'app, ou passez --only=<id>.",
		EN: "Start the installation from the app, or pass --only=<id>.",
	},
	"cli.step.done": {
		FR: "déjà fait",
		EN: "already done",
	},
	"cli.step.replay": {
		FR: "relance : %s",
		EN: "replay: %s",
	},
	"cli.summary.clean": {
		FR: "Aucune étape en échec. Rapport : %s",
		EN: "No failed step. Report: %s",
	},
	"cli.summary.failed": {
		FR: "%d étape(s) en échec :",
		EN: "%d failed step(s):",
	},
	"cli.summary.report": {
		FR: "Rapport : %s",
		EN: "Report: %s",
	},
	"cli.enroll.token.expected": {
		FR: "token de rattachement attendu sur l'entrée standard",
		EN: "enrolment token expected on standard input",
	},
	"cli.enroll.done": {
		FR: "serveur rattaché",
		EN: "server enrolled",
	},
	"cli.enroll.sync.failed": {
		FR: "premier état non lu, l'agent réessaiera : %s",
		EN: "first state not read, the agent will retry: %s",
	},
}
