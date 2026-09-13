package i18n

// The registry of installed modules, and what it refuses.
var registryCatalog = map[string]Message{
	"registry.name.invalid": {
		FR: "nom de projet invalide : %s",
		EN: "invalid project name: %s",
	},
	"registry.name.invalid.fix": {
		FR: "Minuscules, chiffres, point, tiret et souligné, en commençant par une lettre ou un chiffre.",
		EN: "Lower case, digits, dot, dash and underscore, starting with a letter or a digit.",
	},
	"registry.dir.invalid": {
		FR: "dossier invalide : %s",
		EN: "invalid folder: %s",
	},
	"registry.dir.invalid.fix": {
		FR: "Donnez un chemin relatif à %s, sans « .. ».",
		EN: `Give a path relative to %s, without "..".`,
	},
	"registry.port.invalid": {
		FR: "port invalide : %d",
		EN: "invalid port: %d",
	},
	"registry.port.invalid.fix": {
		FR: "Choisissez un port entre 1024 et %d, par exemple %d.",
		EN: "Choose a port between 1024 and %d, for example %d.",
	},
	"registry.pkgmgr.unknown": {
		FR: "gestionnaire de paquets inconnu : %s",
		EN: "unknown package manager: %s",
	},
	"registry.pkgmgr.unknown.fix": {
		FR: "Choisissez %s.",
		EN: "Choose %s.",
	},
	"registry.cmd.empty": {
		FR: "commande de démarrage vide",
		EN: "the start command is empty",
	},
	"registry.cmd.empty.fix": {
		FR: "Donnez la commande qui lance le projet, par exemple « bun run dev --port 3000 ».",
		EN: `Give the command that starts the project, for example "bun run dev --port 3000".`,
	},
	"registry.sub.invalid": {
		FR: "sous-domaine invalide : %s",
		EN: "invalid subdomain: %s",
	},
	"registry.sub.invalid.fix": {
		FR: "Minuscules, chiffres et tirets, en commençant et en finissant par une lettre ou un chiffre. Plusieurs niveaux séparés par des points sont acceptés, mais le certificat joker ne couvre que le premier.",
		EN: "Lower case, digits and dashes, starting and ending on a letter or a digit. Several levels separated by dots are accepted, but the wildcard certificate only covers the first.",
	},
	"registry.branch.invalid": {
		FR: "branche invalide : %s",
		EN: "invalid branch: %s",
	},
	"registry.host.invalid": {
		FR: "hôte invalide : %s",
		EN: "invalid host: %s",
	},
	"registry.host.invalid.fix": {
		FR: "Laissez 127.0.0.1, ou donnez le nom en .localhost que le script de démarrage fige, par exemple « react-box.localhost ».",
		EN: `Leave 127.0.0.1, or give the .localhost name the start script freezes, for example "react-box.localhost".`,
	},
	"registry.branch.invalid.fix": {
		FR: "Donnez un nom de branche tel que git l'écrit, par exemple « main » ou « release/2.0 ».",
		EN: `Give a branch name as git writes it, for example "main" or "release/2.0".`,
	},
	"registry.project.declared": {
		FR: "%s est déjà déclaré",
		EN: "%s is already declared",
	},
	"registry.project.declared.fix": {
		FR: "Retirez-le avec project.remove, ou choisissez un autre nom.",
		EN: "Remove it with project.remove, or choose another name.",
	},
	"registry.hostname.taken": {
		FR: "l'adresse %s est déjà prise par %s",
		EN: "the address %s is already taken by %s",
	},
	"registry.hostname.taken.fix": {
		FR: "Choisissez un autre sous-domaine pour cette route.",
		EN: "Choose another subdomain for this route.",
	},
	"registry.hostname.invalid": {
		FR: "nom d'hôte invalide : %s",
		EN: "invalid hostname: %s",
	},
	"registry.hostname.invalid.fix": {
		FR: "Un nom complet, minuscules, chiffres et tirets, au moins deux niveaux séparés par des points : api.shop.example.org.",
		EN: "A whole name, lower case, digits and dashes, at least two levels separated by dots: api.shop.example.org.",
	},
	"registry.hostname.foreign": {
		FR: "%s n'est pas sous le domaine de ce serveur (%s)",
		EN: "%s is not under this server's domain (%s)",
	},
	"registry.hostname.foreign.fix": {
		FR: "Donnez un nom sous %s : le tunnel et le DNS de ce serveur ne portent rien d'autre.",
		EN: "Give a name under %s: the tunnel and the DNS of this server carry nothing else.",
	},
	"registry.route.noDomain": {
		FR: "aucun domaine sur ce serveur pour publier %s",
		EN: "no domain on this server to publish %s under",
	},
	"registry.route.noDomain.fix": {
		FR: "Installez un module d'exposition (Cloudflare ou Caddy) avec son domaine, ou laissez ce port sans sous-domaine.",
		EN: "Install an exposure module (Cloudflare or Caddy) with its domain, or leave this port without a subdomain.",
	},
	"registry.route.both": {
		FR: "la route %s nomme un sous-domaine et un nom d'hôte à la fois",
		EN: "route %s names a subdomain and a hostname at once",
	},
	"registry.route.both.fix": {
		FR: "Donnez l'un ou l'autre : le sous-domaine, que l'agent complète, ou le nom d'hôte entier.",
		EN: "Give one or the other: the subdomain, which the agent completes, or the whole hostname.",
	},
	"registry.route.label.invalid": {
		FR: "libellé de route invalide : %s",
		EN: "invalid route label: %s",
	},
	"registry.route.label.invalid.fix": {
		FR: "Un mot court en minuscules, chiffres et tirets, comme « web » ou « api ».",
		EN: `A short word in lower case, digits and dashes, like "web" or "api".`,
	},
	"registry.route.label.duplicate": {
		FR: "deux routes portent le libellé %s",
		EN: "two routes carry the label %s",
	},
	"registry.route.label.duplicate.fix": {
		FR: "Donnez un libellé différent à chaque port du projet.",
		EN: "Give each port of the project its own label.",
	},
	"registry.port.taken": {
		FR: "le port %d est déjà pris par %s",
		EN: "port %d is already taken by %s",
	},
	"registry.port.taken.fix": {
		FR: "Donnez un autre port à %s, par exemple %d.",
		EN: "Give %s another port, for example %d.",
	},
}
