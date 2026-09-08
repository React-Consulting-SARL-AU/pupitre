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
		FR: "Donne un chemin relatif à %s, sans « .. ».",
		EN: `Give a path relative to %s, without "..".`,
	},
	"registry.port.invalid": {
		FR: "port invalide : %d",
		EN: "invalid port: %d",
	},
	"registry.port.invalid.fix": {
		FR: "Choisis un port entre 1024 et %d, par exemple %d.",
		EN: "Choose a port between 1024 and %d, for example %d.",
	},
	"registry.pkgmgr.unknown": {
		FR: "gestionnaire de paquets inconnu : %s",
		EN: "unknown package manager: %s",
	},
	"registry.pkgmgr.unknown.fix": {
		FR: "Choisis %s.",
		EN: "Choose %s.",
	},
	"registry.cmd.empty": {
		FR: "commande de démarrage vide",
		EN: "the start command is empty",
	},
	"registry.cmd.empty.fix": {
		FR: "Donne la commande qui lance le projet, par exemple « bun run dev --port 3000 ».",
		EN: `Give the command that starts the project, for example "bun run dev --port 3000".`,
	},
	"registry.sub.invalid": {
		FR: "sous-domaine invalide : %s",
		EN: "invalid subdomain: %s",
	},
	"registry.sub.invalid.fix": {
		FR: "Un seul niveau, minuscules, chiffres et tirets — c'est ce que couvre le certificat joker.",
		EN: "One level only, lower case, digits and dashes — that is what the wildcard certificate covers.",
	},
	"registry.field.separator": {
		FR: "%s : le caractère « | » et les retours à la ligne sont interdits",
		EN: `%s: the "|" character and line breaks are not allowed`,
	},
	"registry.field.separator.fix": {
		FR: "Retire-les : « | » sépare les colonnes du registre.",
		EN: `Remove them: "|" separates the columns of the registry.`,
	},
	"registry.field.name": {
		FR: "nom",
		EN: "name",
	},
	"registry.field.dir": {
		FR: "dossier",
		EN: "folder",
	},
	"registry.field.repo": {
		FR: "dépôt",
		EN: "repository",
	},
	"registry.field.host": {
		FR: "hôte",
		EN: "host",
	},
	"registry.field.sub": {
		FR: "sous-domaine",
		EN: "subdomain",
	},
	"registry.field.cmd": {
		FR: "commande",
		EN: "command",
	},
	"registry.field.install": {
		FR: "installation",
		EN: "install",
	},
	"registry.project.declared": {
		FR: "%s est déjà déclaré",
		EN: "%s is already declared",
	},
	"registry.project.declared.fix": {
		FR: "Retire-le avec project.remove, ou choisis un autre nom.",
		EN: "Remove it with project.remove, or choose another name.",
	},
	"registry.sub.taken": {
		FR: "le sous-domaine %s est déjà pris par %s",
		EN: "subdomain %s is already taken by %s",
	},
	"registry.sub.taken.fix": {
		FR: "Choisis un autre sous-domaine.",
		EN: "Choose another subdomain.",
	},
	"registry.port.taken": {
		FR: "le port %d est déjà pris par %s",
		EN: "port %d is already taken by %s",
	},
	"registry.port.taken.fix": {
		FR: "Donne un autre port à %s, par exemple %d.",
		EN: "Give %s another port, for example %d.",
	},
}
