package i18n

var gateCatalog = map[string]Message{
	"gate.page.title": {
		FR: "Accès protégé",
		EN: "Protected access",
	},
	"gate.page.lead": {
		FR: "Ce site ne s'ouvre qu'avec une clé d'accès Pupitre.",
		EN: "This site opens only with a Pupitre access key.",
	},
	"gate.page.label": {
		FR: "Clé d'accès",
		EN: "Access key",
	},
	"gate.page.action": {
		FR: "Ouvrir le site",
		EN: "Open the site",
	},
	"gate.page.hint": {
		FR: "Le propriétaire du serveur crée les clés dans Pupitre, dans la configuration du projet, onglet Accès.",
		EN: "The server's owner creates keys in Pupitre, in the project's configuration, Access tab.",
	},
	"gate.page.refused": {
		FR: "Cette clé n'ouvre pas ce site : elle est inconnue, révoquée ou limitée à d'autres projets.",
		EN: "This key does not open this site: it is unknown, revoked or limited to other projects.",
	},
	"gate.page.throttled": {
		FR: "Trop de clés refusées depuis cette adresse. Réessayez dans dix minutes.",
		EN: "Too many refused keys from this address. Try again in ten minutes.",
	},
	"gate.api.required": {
		FR: "clé d'accès requise",
		EN: "access key required",
	},
	"gate.api.required.fix": {
		FR: "Envoyez la clé dans l'en-tête %s, ou dans le paramètre %s là où un en-tête ne se pose pas (WebSocket, EventSource).",
		EN: "Send the key in the %s header, or in the %s query parameter where a header cannot be set (WebSocket, EventSource).",
	},
	"gate.api.throttled": {
		FR: "trop de clés refusées depuis cette adresse",
		EN: "too many refused keys from this address",
	},
	"gate.api.throttled.fix": {
		FR: "Réessayez dans dix minutes.",
		EN: "Try again in ten minutes.",
	},
}
