package i18n

var loginCatalog = map[string]Message{
	"login.claude.fix": {
		FR: "Ouvrez un terminal sur ce serveur et lancez claude auth login : l'URL affichée ouvre la connexion dans votre navigateur.",
		EN: "Open a terminal on this server and run claude auth login: the URL it prints opens the sign-in in your browser.",
	},
	"login.codex.fix": {
		FR: "Ouvrez un terminal sur ce serveur et lancez codex login --device-auth : le code affiché s'entre sur la page qu'il indique.",
		EN: "Open a terminal on this server and run codex login --device-auth: the code it prints goes on the page it names.",
	},
	"login.cursor.fix": {
		FR: "Ouvrez un terminal sur ce serveur et lancez NO_OPEN_BROWSER=1 cursor-agent login : l'URL affichée ouvre la connexion dans votre navigateur.",
		EN: "Open a terminal on this server and run NO_OPEN_BROWSER=1 cursor-agent login: the URL it prints opens the sign-in in your browser.",
	},
	"login.opencode.fix": {
		FR: "Ouvrez un terminal sur ce serveur et lancez opencode auth login : choisissez le fournisseur, puis l'abonnement ou la clé qui va avec.",
		EN: "Open a terminal on this server and run opencode auth login: pick the provider, then the subscription or the key that goes with it.",
	},
	"login.tailscale.fix": {
		FR: "La machine n'est sur aucun tailnet : appliquez la configuration de ce service avec une clé d'authentification valide, ou lancez sudo tailscale up dans un terminal sur ce serveur et ouvrez l'URL affichée.",
		EN: "The machine is on no tailnet: apply this service's configuration with a valid auth key, or run sudo tailscale up in a terminal on this server and open the URL it prints.",
	},
	"login.github.fix": {
		FR: "Reconnectez le compte GitHub dans l'app puis appliquez la configuration de ce service ; ou lancez gh auth login dans un terminal sur ce serveur.",
		EN: "Reconnect the GitHub account in the app and apply this service's configuration; or run gh auth login in a terminal on this server.",
	},
	"login.vscode.fix": {
		FR: "Ouvrez un terminal sur ce serveur et lancez code tunnel user login : le code affiché s'entre sur la page qu'il indique.",
		EN: "Open a terminal on this server and run code tunnel user login: the code it prints goes on the page it names.",
	},
	"login.token.absent": {
		FR: "Connectez le compte %s dans l'app puis appliquez la configuration de ce service : la clé repart sur la machine.",
		EN: "Connect the %s account in the app and apply this service's configuration: the key goes back to the machine.",
	},
	"login.token.refused": {
		FR: "Le compte %s n'a pas répondu à la clé que la machine tient : reconnectez-le dans l'app puis appliquez la configuration de ce service.",
		EN: "The %s account did not answer the key the machine holds: reconnect it in the app and apply this service's configuration.",
	},
	"login.unanswered": {
		FR: "%s n'a pas répondu à sa propre vérification : relisez ce service dans un instant, ou lancez %s dans un terminal sur ce serveur.",
		EN: "%s did not answer its own check: read this service again in a moment, or run %s in a terminal on this server.",
	},
}
