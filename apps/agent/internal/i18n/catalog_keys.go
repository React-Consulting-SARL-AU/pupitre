package i18n

// The keys a device lays or approves, the recovery from the hosting console, and what else the agent refuses to take from the platform on its word.
var keysCatalog = map[string]Message{
	"keys.trust.refused": {
		FR: "clé refusée : seule une clé ed25519 ou ecdsa nue, « type base64 », sans option ni commentaire, peut ouvrir ce serveur",
		EN: "key refused: only a bare ed25519 or ecdsa key, `type base64`, without options or comment, can open this server",
	},
	"keys.trust.refused.fix": {
		FR: "Envoyez la clé publique de cet appareil telle que la lit `ssh-keygen -y`, sans son commentaire.",
		EN: "Send this device's public key as `ssh-keygen -y` reads it, without its comment.",
	},
	"keys.trust.root": {
		FR: "keys.trust écrit dans /etc/pupitre, qui appartient à root, et pupitred serve ne tourne pas en root",
		EN: "keys.trust writes to /etc/pupitre, which belongs to root, and pupitred serve is not running as root",
	},
	"keys.trust.root.fix": {
		FR: "Ouvrez le canal avec `sudo pupitred serve --privileged`.",
		EN: "Open the channel with `sudo pupitred serve --privileged`.",
	},
	"keys.trust.failed": {
		FR: "la clé n'a pas pu être posée : %s",
		EN: "the key could not be laid: %s",
	},
	"keys.trust.failed.fix": {
		FR: "Relancez l'autorisation de cet appareil ; si elle échoue encore, lisez /var/log/pupitre.log sur le serveur.",
		EN: "Authorize this device again; if it fails again, read /var/log/pupitre.log on the server.",
	},
	"keys.reset.usage": {
		FR: "usage : sudo pupitred keys reset --key <clé publique OpenSSH | chemin d'un fichier .pub>",
		EN: "usage: sudo pupitred keys reset --key <OpenSSH public key | path to a .pub file>",
	},
	"keys.reset.root": {
		FR: "keys reset réécrit /etc/pupitre et l'authorized_keys de dev : lancez-le en root, `sudo pupitred keys reset --key …`",
		EN: "keys reset rewrites /etc/pupitre and dev's authorized_keys: run it as root, `sudo pupitred keys reset --key …`",
	},
	"keys.reset.unreadable": {
		FR: "%s n'a pas pu être lu : %s",
		EN: "%s could not be read: %s",
	},
	"keys.reset.refused": {
		FR: "clé refusée : une clé publique ed25519 ou ecdsa est attendue, sans option, comme la première ligne d'un fichier .pub",
		EN: "key refused: an ed25519 or ecdsa public key is expected, without options, like the first line of a .pub file",
	},
	"keys.reset.failed": {
		FR: "la clé n'a pas pu être reposée : %s",
		EN: "the key could not be laid again: %s",
	},
	"keys.reset.done": {
		FR: "Le bloc géré de %s ne contient plus que %s, seule clé de confiance de ce serveur.",
		EN: "The managed block of %s now holds only %s, the only trusted key of this server.",
	},
	"keys.reset.next": {
		FR: "Connectez-vous depuis l'app avec la clé privée correspondante : l'onboarding reprend cet appareil.",
		EN: "Connect from the app with the matching private key: the onboarding takes this device back.",
	},
	"backup.location.digest": {
		FR: "l'emplacement de la sauvegarde %s ne donne pas l'empreinte de son manifeste : rien n'est restauré sans elle",
		EN: "the location of backup %s gives no digest of its manifest: nothing is restored without it",
	},
	"backup.location.digest.fix": {
		FR: "Choisissez la sauvegarde dans la liste de l'app, qui transmet l'empreinte que la plateforme a enregistrée.",
		EN: "Pick the backup from the app's list, which passes on the digest the platform recorded.",
	},
}
