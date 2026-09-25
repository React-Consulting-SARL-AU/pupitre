package i18n

// Hardening: why root stayed open, and what to do to close it.
var hardenCatalog = map[string]Message{
	"harden.sshd.invalid": {
		FR: "configuration sshd invalide, fragment retiré, root reste ouvert : %s",
		EN: "the sshd configuration is invalid, the fragment was removed, root stays open: %s",
	},
	"harden.sshd.reload.failed": {
		FR: "rechargement de sshd en échec, fragment retiré et sshd rechargé sur la configuration précédente, root reste ouvert : %s",
		EN: "reloading sshd failed, the fragment was removed and sshd reloaded on the previous configuration, root stays open: %s",
	},
	"harden.sshd.reload.unrestored": {
		FR: "rechargement de sshd en échec, fragment retiré mais sshd n'a pas pu être rechargé non plus, root reste ouvert : %s · %s",
		EN: "reloading sshd failed, the fragment was removed but sshd could not be reloaded either, root stays open: %s · %s",
	},
	"harden.sshd.restored": {
		FR: "sshd rechargé sur la configuration précédente",
		EN: "sshd reloaded on the previous configuration",
	},
	"harden.sshd.unrestored": {
		FR: "sshd n'a pas pu être rechargé sur la configuration précédente : %s",
		EN: "sshd could not be reloaded on the previous configuration: %s",
	},
	"harden.ports.unreadable": {
		FR: "impossible de lire les ports où sshd écoute, pare-feu laissé tel quel : %s",
		EN: "the ports sshd listens on cannot be read, the firewall is left as it is: %s",
	},
	"warn.hardening.links.deferred": {
		FR: "/proc/sys est en lecture seule, le noyau garde ses valeurs pour fs.protected_hardlinks et fs.protected_symlinks : %s les fixe à 1 au prochain démarrage",
		EN: "/proc/sys is read-only, the kernel keeps its values for fs.protected_hardlinks and fs.protected_symlinks: %s sets them to 1 at the next boot",
	},
	"harden.user.missing": {
		FR: "l'utilisateur %s n'existe pas : installez core.system puis relancez harden",
		EN: "the user %s does not exist: install core.system, then run harden again",
	},
	"harden.keys.none": {
		FR: "aucune clé dans %s : ajoutez la clé publique du poste puis relancez harden",
		EN: "no key in %s: add the laptop's public key, then run harden again",
	},
	"harden.keys.malformed": {
		FR: "aucune clé bien formée dans %s (%d ligne(s) illisible(s)) : ajoutez la clé publique du poste puis relancez harden",
		EN: "no well-formed key in %s (%d unreadable line(s)): add the laptop's public key, then run harden again",
	},
	"command.params.unreadable": {
		FR: "paramètres illisibles : %s",
		EN: "the parameters cannot be read: %s",
	},
}
