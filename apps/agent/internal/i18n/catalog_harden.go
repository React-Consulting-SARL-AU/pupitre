package i18n

// Hardening: why root stayed open, and what to do to close it.
var hardenCatalog = map[string]Message{
	"harden.sshd.invalid": {
		FR: "configuration sshd invalide, fragment retiré, root reste ouvert : %s",
		EN: "the sshd configuration is invalid, the fragment was removed, root stays open: %s",
	},
	"harden.sshd.reload.failed": {
		FR: "rechargement de sshd en échec, fragment retiré, root reste ouvert : %s",
		EN: "reloading sshd failed, the fragment was removed, root stays open: %s",
	},
	"harden.user.missing": {
		FR: "l'utilisateur %s n'existe pas : installe core.system puis relancez harden",
		EN: "the user %s does not exist: install core.system, then run harden again",
	},
	"harden.keys.none": {
		FR: "aucune clé dans %s : ajoute la clé publique du poste puis relancez harden",
		EN: "no key in %s: add the laptop's public key, then run harden again",
	},
	"harden.keys.malformed": {
		FR: "aucune clé bien formée dans %s (%d ligne(s) illisible(s)) : ajoute la clé publique du poste puis relancez harden",
		EN: "no well-formed key in %s (%d unreadable line(s)): add the laptop's public key, then run harden again",
	},
	"command.params.unreadable": {
		FR: "paramètres illisibles : %s",
		EN: "the parameters cannot be read: %s",
	},
}
