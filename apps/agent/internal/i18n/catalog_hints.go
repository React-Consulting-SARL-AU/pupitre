package i18n

// The long form of a field's help, shown behind a bubble: where a value is found, and what it costs to get it wrong.
var hintCatalog = map[string]Message{
	"module.core.system.timezone.hint": {
		FR: "Le fuseau du serveur, au format IANA : Europe/Paris, America/New_York, Africa/Casablanca. Il décide de l'heure des journaux, des tâches planifiées et des horodatages des projets. « timedatectl list-timezones » donne la liste complète sur une machine Ubuntu.",
		EN: "The server's time zone, in IANA form: Europe/Paris, America/New_York, Africa/Casablanca. It decides the time of the journals, the scheduled tasks and the projects' timestamps. `timedatectl list-timezones` gives the full list on an Ubuntu machine.",
	},
	"module.core.system.git_name.help": {
		FR: "Le nom qui signera les commits faits sur ce serveur.",
		EN: "The name that will sign the commits made on this server.",
	},
	"module.core.system.git_email.help": {
		FR: "L'adresse qui signera les commits faits sur ce serveur.",
		EN: "The address that will sign the commits made on this server.",
	},
	"module.core.system.projects_dir.help": {
		FR: "Le dossier où les projets sont clonés.",
		EN: "The directory the projects are cloned into.",
	},
	"module.core.system.projects_dir.hint": {
		FR: "Un chemin absolu, sans espace, appartenant au compte dev. Le défaut convient à presque tout le monde ; on le change pour poser les projets sur un disque plus grand, monté ailleurs. Le dossier est créé s'il n'existe pas, et jamais vidé s'il existe.",
		EN: "An absolute path, with no space, owned by the dev account. The default suits almost everyone; you change it to put the projects on a larger disk mounted elsewhere. The directory is created if absent, and never emptied if it exists.",
	},
	"module.core.hardening.ssh_443.hint": {
		FR: "Ouvrez SSH sur le port 443 en plus du 22. Utile depuis un réseau d'entreprise ou un wifi public qui ne laisse sortir que le web. Le port 22 reste ouvert, et aucune des deux porvos n'accepte de mot de passe une fois le durcissement passé.",
		EN: "Opens SSH on port 443 as well as 22. Useful from a corporate network or a public wifi that only lets the web out. Port 22 stays open, and neither door accepts a password once the hardening has run.",
	},
	"module.core.hardening.keep_root.hint": {
		FR: "Laissez root joignable par clé SSH, jamais par mot de passe, et appliquez tout le reste du durcissement. Pour qui veut garder une seconde porte sur sa machine. Sans cette option, root est fermé, et le compte dev devient le seul accès — l'app vérifie qu'une clé l'ouvre avant de fermer quoi que ce soit.",
		EN: "Leaves root reachable by SSH key, never by password, and applies the whole rest of the hardening. For whoever wants to keep a second door onto their machine. Without it root is closed and the dev account becomes the only way in — the app checks a key opens it before closing anything.",
	},
	"module.db.remote.hint": {
		FR: "Le compte que votre poste utilise pour ouvrir la base depuis un client graphique, à travers le tunnel SSH que l'app ouvre. Il est distinct du compte applicatif : ce que vous inspectez à la main et ce que le projet écrit ne portent pas le même nom dans les journaux.",
		EN: "The account your workstation uses to open the database from a graphical client, through the SSH tunnel the app opens. It is separate from the application account: what you inspect by hand and what the project writes do not share a name in the journals.",
	},
	"module.db.mysql.buffer_pool.hint": {
		FR: "La mémoire que le moteur garde pour ses pages, comme 512M ou 2G. Laissé vide, le module dimensionne au quart de la mémoire de la machine, ce qui convient à un serveur qui fait aussi tourner des projets. On l'augmente pour une base qui devient le poste de travail principal.",
		EN: "The memory the engine keeps for its pages, like 512M or 2G. Left empty, the module sizes it at a quarter of the machine's memory, which suits a server that also runs projects. You raise it for a database that becomes the main workload.",
	},
	"module.runtime.php.memory_limit.hint": {
		FR: "La limite de mémoire d'un script PHP, comme 256M ou 1G. Laissé vide, la valeur compilée par défaut s'applique. Un « memory_limit » atteint se voit dans les journaux du projet, pas dans une page blanche.",
		EN: "The memory limit of a PHP script, like 256M or 1G. Left empty, the compiled default applies. A `memory_limit` reached shows in the project's journal, not in a blank page.",
	},
	"module.runtime.docker.data_root.hint": {
		FR: "Où Docker range ses images, ses volumes et ses conteneurs. Laissé vide, c'est /var/lib/docker. On le déplace vers un disque plus grand quand les images saturent la partition racine ; les images déjà posées n'y sont pas déplacées.",
		EN: "Where Docker keeps its images, volumes and containers. Left empty, that is /var/lib/docker. You move it to a larger disk when the images fill the root partition; images already there are not moved for you.",
	},
	"module.editor.zed.version.hint": {
		FR: "Le serveur distant doit correspondre exactement à la version de Zed installée sur votre poste, que « Zed › About Zed » affiche. « latest » suit la dernière version publiée, ce qui convient tant que votre client se met à jour aussi.",
		EN: "The remote server must match exactly the Zed version installed on your workstation, which `Zed › About Zed` shows. `latest` follows the latest published version, which suits as long as your client updates too.",
	},
	"module.editor.jetbrains.version.hint": {
		FR: "Le backend distant doit correspondre à la version de JetBrains Gateway installée sur votre poste, que « Gateway › About » affiche. « latest » suit la dernière version publiée du produit choisi.",
		EN: "The remote backend must match the JetBrains Gateway version installed on your workstation, which `Gateway › About` shows. `latest` follows the latest published version of the chosen product.",
	},
	"module.editor.vscode.extensions.hint": {
		FR: "Un identifiant par ligne, sous la forme éditeur.extension — biomejs.biome, golang.go. Il se lit dans l'URL de la place de marché, ou par « Copier l'identifiant de l'extension » dans le menu contextuel de VS Code. Elles sont posées côté serveur, là où le code vit.",
		EN: "One identifier per line, in the form publisher.extension — biomejs.biome, golang.go. You read it in the marketplace URL, or through `Copy Extension ID` in VS Code's context menu. They are installed on the server side, where the code lives.",
	},
	"module.ai.hermes.providers.hint": {
		FR: "Une entrée par fournisseur, sous la forme fournisseur=clé : openai=sk-…, anthropic=sk-ant-…, openrouter=sk-or-…. Chaque clé se crée sur le tableau de bord du fournisseur. Elles partent sur le flux secret et sont écrivos sur le serveur en 0600, jamais dans un journal.",
		EN: "One entry per provider, in the form provider=key: openai=sk-…, anthropic=sk-ant-…, openrouter=sk-or-…. Each key is created on that provider's dashboard. They leave on the secret stream and are written on the server at 0600, never in a journal.",
	},
}
