package i18n

// The module engine: what it refuses, and what to do to make it accept.
var engineCatalog = map[string]Message{
	"module.notInstalled": {
		FR: "%s n'est pas installé sur ce serveur",
		EN: "%s is not installed on this server",
	},
	"module.notInstalled.fix": {
		FR: "Installe %s depuis le catalogue de l'app.",
		EN: "Install %s from the app's catalogue.",
	},
	"engine.report.none": {
		FR: "aucun rapport : aucune installation n'a encore eu lieu sur ce serveur",
		EN: "no report: no installation has happened on this server yet",
	},
	"engine.report.none.fix": {
		FR: "Lance install depuis l'app, ou sudo pupitred install sur le serveur.",
		EN: "Run install from the app, or sudo pupitred install on the server.",
	},
	"engine.remembered.unreadable": {
		FR: "%s illisible : %s",
		EN: "%s cannot be read: %s",
	},
	"engine.remembered.unreadable.fix": {
		FR: "Corrige ou supprime %s sur le serveur, puis relance l'installation depuis l'app.",
		EN: "Fix or delete %s on the server, then run the installation again from the app.",
	},
	"engine.busy": {
		FR: "une installation est déjà en cours",
		EN: "an installation is already running",
	},
	"engine.busy.fix": {
		FR: "Attends la fin de l'installation en cours.",
		EN: "Wait for the running installation to finish.",
	},
	"engine.conflict.installed": {
		FR: "%s est en conflit avec %s, déjà installé",
		EN: "%s conflicts with %s, which is already installed",
	},
	"engine.conflict.installed.fix": {
		FR: "Désinstalle %s d'abord.",
		EN: "Uninstall %s first.",
	},
	"resolve.conflict": {
		FR: "les modules %s et %s sont en conflit",
		EN: "modules %s and %s conflict",
	},
	"resolve.conflict.fix": {
		FR: "Retire l'un des deux de la sélection.",
		EN: "Take one of the two out of the selection.",
	},
	"resolve.cycle": {
		FR: "dépendances circulaires entre les modules %s",
		EN: "circular dependencies between modules %s",
	},
	"resolve.module.unknown": {
		FR: "module inconnu : %s",
		EN: "unknown module: %s",
	},
	"resolve.module.unknown.fix": {
		FR: "Demande catalog pour la liste des modules de cet agent.",
		EN: "Ask catalog for the list of this agent's modules.",
	},
}
