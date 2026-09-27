package i18n

var accessCatalog = map[string]Message{
	"access.unreadable": {
		FR: "%s illisible : %s",
		EN: "%s cannot be read: %s",
	},
	"access.key.taken": {
		FR: "une clé d'accès porte déjà l'identifiant %s",
		EN: "an access key already carries the id %s",
	},
	"access.key.taken.fix": {
		FR: "Créez la clé à nouveau : l'app tire un autre identifiant.",
		EN: "Create the key again: the app draws another id.",
	},
	"access.key.unknown": {
		FR: "aucune clé d'accès ne porte l'identifiant %s",
		EN: "no access key carries the id %s",
	},
	"access.key.unknown.fix": {
		FR: "Relisez la liste des clés : elle a été révoquée depuis une autre session.",
		EN: "Read the list of keys again: it was revoked from another session.",
	},
	"access.busy": {
		FR: "les clés d'accès sont en cours d'écriture par une autre session",
		EN: "the access keys are being written by another session",
	},
	"access.busy.fix": {
		FR: "Réessayez dans un instant.",
		EN: "Try again in a moment.",
	},
}
