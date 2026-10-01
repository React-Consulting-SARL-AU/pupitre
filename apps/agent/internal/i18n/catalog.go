package i18n

var catalog = map[string]Message{
	"protocol.secrets.fix": {
		FR: `Écris les secrets en JSON sur une seule ligne de l'entrée standard, juste après la requête : {"<clé>":"<valeur>"}.`,
		EN: `Write the secrets as JSON on a single line of standard input, right after the request: {"<key>":"<value>"}.`,
	},
	"protocol.secrets.missing": {
		FR: "ligne de secrets absente : %s",
		EN: "the secrets line is missing: %s",
	},
	"protocol.hello.required": {
		FR: "hello attendu avant toute commande",
		EN: "hello is expected before any command",
	},
	"protocol.hello.required.fix": {
		FR: "Envoyez hello {app_version, protocol} en premier.",
		EN: "Send hello {app_version, protocol} first.",
	},
	"protocol.command.unknown": {
		FR: "commande inconnue : %s",
		EN: "unknown command: %s",
	},
	"protocol.license.required": {
		FR: "licence requise : ce serveur est en mode restreint",
		EN: "a licence is required: this server is in restricted mode",
	},
	"protocol.license.required.fix": {
		FR: "Ouvrez %s : Pupitre est gratuit jusqu'à 3 serveurs par organisation, une licence est requise au-delà.",
		EN: "Open %s: Pupitre is free for up to 3 servers per organization, a licence is required beyond that.",
	},
	"protocol.internal": {
		FR: "erreur interne : %s",
		EN: "internal error: %s",
	},
	"protocol.secrets.unreadable": {
		FR: "ligne de secrets illisible : un objet JSON sur une ligne est attendu",
		EN: "the secrets line is unreadable: a JSON object on one line is expected",
	},
	"protocol.params.invalid": {
		FR: "paramètres invalides : %s",
		EN: "invalid parameters: %s",
	},
	"protocol.params.unreadable": {
		FR: "paramètres illisibles : %s",
		EN: "the parameters cannot be read: %s",
	},
	"protocol.request.invalid": {
		FR: "requête invalide : %s",
		EN: "invalid request: %s",
	},
	"protocol.id.not_increasing": {
		FR: "id %d refusé : l'id doit être strictement croissant, dernier id reçu %d",
		EN: "id %d is refused: an id has to grow strictly, last id received %d",
	},
	"protocol.secrets.stdin_closed": {
		FR: "l'entrée standard s'est fermée après la requête",
		EN: "standard input closed after the request",
	},
	"protocol.secrets.next_is_request": {
		FR: "la ligne suivante est une requête",
		EN: "the next line is a request",
	},
	"protocol.mismatch": {
		FR: "protocole %d non pris en charge : cet agent parle le protocole %d",
		EN: "protocol %d is not supported: this agent speaks protocol %d",
	},
	"protocol.mismatch.fix": {
		FR: "Mettez à jour l'agent avec agent.upgrade, ou l'app, jusqu'au protocole %d.",
		EN: "Update the agent with agent.upgrade, or the app, up to protocol %d.",
	},
	"protocol.app.too_old": {
		FR: "app %s trop ancienne : cet agent %s sert les apps %s et plus récentes",
		EN: "app %s is too old: this agent %s serves apps %s and newer",
	},
	"protocol.app.too_old.fix": {
		FR: "Mettez à jour Pupitre jusqu'à la version %s, puis rouvrez ce serveur.",
		EN: "Update Pupitre to version %s, then open this server again.",
	},
	"protocol.agent.too_old": {
		FR: "agent %s trop ancien : l'app %s pilote les agents %s et plus récents",
		EN: "agent %s is too old: app %s drives agents %s and newer",
	},
	"protocol.agent.too_old.fix": {
		FR: "Mettez à jour cet agent jusqu'à la version %s depuis le bandeau de mise à jour de l'app.",
		EN: "Update this agent to version %s from the app's update banner.",
	},
}
