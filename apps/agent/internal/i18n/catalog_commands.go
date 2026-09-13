package i18n

// The agent service, the project registry, sessions, and terminal commands.
var commandCatalog = map[string]Message{
	"exposure.none": {
		FR: "aucune exposition n'est installée sur ce serveur",
		EN: "no exposure is installed on this server",
	},
	"exposure.none.fix": {
		FR: "Ajoutez une exposition depuis le catalogue de l'app : Cloudflare Tunnel, Caddy, ou l'accès par SSH seul.",
		EN: "Add an exposure from the app's catalogue: Cloudflare Tunnel, Caddy, or SSH-only access.",
	},

	"daemon.enroll.refused": {
		FR: "la plateforme refuse ce jeton d'enrôlement : %s",
		EN: "the platform refuses this enrolment token: %s",
	},
	"daemon.enroll.refused.fix": {
		FR: "Relancez l'installation depuis l'app pour obtenir un jeton neuf.",
		EN: "Run the installation again from the app to get a fresh token.",
	},
	"daemon.enroll.failed": {
		FR: "enrôlement impossible : %s",
		EN: "enrolment failed: %s",
	},
	"daemon.enroll.failed.fix": {
		FR: "Vérifiez que le serveur joint la plateforme en HTTPS sortant, puis relancez l'installation.",
		EN: "Check that the server reaches the platform over outbound HTTPS, then run the installation again.",
	},
	"platform.down.fix": {
		FR: "L'adresse répond, mais pas la plateforme derrière : réessayez dans quelques minutes, et si ça dure, vérifiez que ce serveur connaît la bonne adresse de plateforme.",
		EN: "The address answers, but not the platform behind it: try again in a few minutes, and if it lasts, check that this server knows the right platform address.",
	},
	"platform.down": {
		FR: "la plateforme ne répond pas derrière son adresse (HTTP %d)",
		EN: "the platform does not answer behind its address (HTTP %d)",
	},
	"platform.answered": {
		FR: "la plateforme a répondu %d",
		EN: "the platform answered %d",
	},
	"platform.unresolved": {
		FR: "%s n'a pas d'adresse connue du DNS de ce serveur",
		EN: "%s has no address known to this server's DNS",
	},
	"platform.timeout": {
		FR: "la plateforme n'a pas répondu à temps",
		EN: "the platform did not answer in time",
	},
	"platform.connection.refused": {
		FR: "rien n'écoute à l'adresse de la plateforme",
		EN: "nothing listens at the platform's address",
	},
	"platform.certificate": {
		FR: "le certificat de la plateforme n'est pas reconnu : %v",
		EN: "the platform's certificate is not recognised: %v",
	},
	"platform.redirects": {
		FR: "la plateforme renvoie de redirection en redirection",
		EN: "the platform redirects from one address to the next without end",
	},
	"platform.token.none": {
		FR: "ce serveur n'a pas de jeton : il n'est pas enrôlé",
		EN: "this server has no token: it is not enrolled",
	},
	"platform.answer.unreadable": {
		FR: "la réponse de la plateforme est illisible",
		EN: "the platform's answer cannot be read",
	},
	"platform.answer.incomplete": {
		FR: "la réponse de la plateforme est incomplète",
		EN: "the platform's answer is incomplete",
	},
	"platform.unreachable": {
		FR: "la plateforme est injoignable : %v",
		EN: "the platform is unreachable: %v",
	},
	"daemon.token.missing.fix": {
		FR: "Réinstallez ce serveur depuis l'app pour lui rendre un jeton de serveur.",
		EN: "Reinstall this server from the app to give it a server token back.",
	},
	"daemon.token.refused": {
		FR: "la plateforme refuse le jeton de ce serveur : %s",
		EN: "the platform refuses this server's token: %s",
	},
	"daemon.token.refused.fix": {
		FR: "Ouvrez https://app.pupitre.studio pour rétablir l'abonnement de ce serveur.",
		EN: "Open https://app.pupitre.studio to restore this server's usage right.",
	},
	"daemon.keys.failed": {
		FR: "clés non synchronisées : %s",
		EN: "the keys were not synchronised: %s",
	},
	"daemon.keys.failed.fix": {
		FR: "Vérifiez que le serveur joint la plateforme en HTTPS sortant, puis relancez keys.sync.",
		EN: "Check that the server reaches the platform over outbound HTTPS, then run keys.sync again.",
	},
	"tmux.journal.none": {
		FR: "aucun journal pour %s",
		EN: "no journal for %s",
	},
	"tmux.journal.none.fix": {
		FR: "Démarrez-le avec project.up : le journal naît au premier démarrage.",
		EN: "Start it with project.up: the journal is born at the first start.",
	},
	"registry.project.versioned": {
		FR: "%s vient du registre du dépôt, pas de ce serveur",
		EN: "%s comes from the repository's registry, not from this server",
	},
	"registry.project.versioned.fix": {
		FR: "Retirez sa ligne de projects.conf dans le dépôt, puis redéployez.",
		EN: "Remove its line from projects.conf in the repository, then deploy again.",
	},
	"registry.project.unknown": {
		FR: "projet inconnu : %s",
		EN: "unknown project: %s",
	},
	"registry.project.unknown.fix": {
		FR: "Appelez project.list pour la liste des projets déclarés.",
		EN: "Call project.list for the list of declared projects.",
	},
	"devcli.project.unknown.fix": {
		FR: "Listez les projets avec pupitred dev status.",
		EN: "List the projects with pupitred dev status.",
	},
	"devcli.engine.expected": {
		FR: "moteur de base attendu",
		EN: "a database engine is expected",
	},
	"devcli.engine.expected.fix": {
		FR: "Donnez le moteur : pupitred dev db %s postgres.",
		EN: "Name the engine: pupitred dev db %s postgres.",
	},
	"db.engine.unknown": {
		FR: "moteur inconnu : %s",
		EN: "unknown engine: %s",
	},
	"db.engine.unknown.fix": {
		FR: "Choisissez mysql, postgres ou mongodb.",
		EN: "Pick mysql, postgres or mongodb.",
	},
	"onepassword.template.none": {
		FR: "%s : ni %s ni %s dans le dépôt",
		EN: "%s: neither %s nor %s in the repository",
	},
	"onepassword.template.none.fix": {
		FR: "Versionnez un %s dans %s, ou un %s si le projet garde ses secrets dans 1Password.",
		EN: "Version a %s in %s, or a %s if the project keeps its secrets in 1Password.",
	},
	"onepassword.inject.empty": {
		FR: "%s : op inject n'a rien produit",
		EN: "%s: op inject produced nothing",
	},
	"onepassword.inject.empty.fix": {
		FR: "Vérifiez que le compte de service voit le coffre du projet : sudo -u %s op vault list.",
		EN: "Check that the service account sees the project's vault: sudo -u %s op vault list.",
	},
	"onepassword.inject.fallback": {
		FR: "%s : 1Password n'a pas répondu, %s copié depuis %s, valeurs à compléter",
		EN: "%s: 1Password did not answer, %s copied from %s, values left to fill in",
	},
	"selfupdate.target.none": {
		FR: "la plateforme n'annonce aucune version cible pour ce serveur",
		EN: "the platform announces no target version for this server",
	},
	"secrets.invalid": {
		FR: "flux secret invalide : %s",
		EN: "the secret stream is invalid: %s",
	},
	"secrets.unreadable": {
		FR: "flux secret validé mais illisible : %s",
		EN: "the secret stream passed validation but cannot be read: %s",
	},
	"secrets.install.fix": {
		FR: "Écrivez les secrets groupés par identifiant de module, comme config : {\"<module id>\": {\"<clé>\": \"<valeur>\"}}.",
		EN: "Write the secrets grouped by module identifier, like config: {\"<module id>\": {\"<key>\": \"<value>\"}}.",
	},
	"daemon.enroll.token.fix": {
		FR: "Écrivez le jeton d'enrôlement sur la ligne suivante, sous la forme {\"enrollment_token\": \"<jeton>\"}.",
		EN: "Write the enrolment token on the next line, as {\"enrollment_token\": \"<token>\"}.",
	},
	"devcli.usage": {
		FR: "usage : pupitred dev <commande> [arguments] [--json]",
		EN: "usage: pupitred dev <command> [arguments] [--json]",
	},
	"devcli.usage.json": {
		FR: "--json rend la réponse du protocole telle quelle. doctor sort en 1 si un point est à corriger.",
		EN: "--json hands back the protocol's answer as it stands. doctor exits 1 when a point needs fixing.",
	},
	"devcli.command.unknown": {
		FR: "commande inconnue : %s",
		EN: "unknown command: %s",
	},
	"devcli.lines.expected": {
		FR: "-n attend un nombre de lignes",
		EN: "-n expects a number of lines",
	},
	"devcli.project.expected": {
		FR: "%s attend un projet",
		EN: "%s expects a project",
	},
	"devcli.db.expected": {
		FR: "db attend url, shell, dump ou import",
		EN: "db expects url, shell, dump or import",
	},
	"devcli.db.unknown": {
		FR: "db %s : choisissez url, shell, dump ou import",
		EN: "db %s: pick url, shell, dump or import",
	},
	"devcli.elevate.required": {
		FR: "cette commande lit l'enrôlement et le droit d'usage du serveur, deux fichiers que seul root ouvre",
		EN: "this command reads the server's enrolment and entitlement, two files only root opens",
	},
	"devcli.elevate.password.fix": {
		FR: "Relancez-la par sudo : sudo dev <commande>.",
		EN: "Run it through sudo: sudo dev <command>.",
	},
	"devcli.elevate.root.fix": {
		FR: "Cette machine n'a pas sudo : ouvrez une session root.",
		EN: "This machine has no sudo: open a root session.",
	},
	"devcli.elevate.binary": {
		FR: "le binaire de l'agent est introuvable : %s",
		EN: "the agent's own binary cannot be found: %s",
	},
	"devcli.up.help": {
		FR: "démarre un projet",
		EN: "starts a project",
	},
	"devcli.down.help": {
		FR: "arrête un projet",
		EN: "stops a project",
	},
	"devcli.restart.help": {
		FR: "redémarre un projet",
		EN: "restarts a project",
	},
	"devcli.status.help": {
		FR: "ce qui tourne, les ports, les services",
		EN: "what runs, the ports, the services",
	},
	"devcli.logs.help": {
		FR: "les dernières lignes du journal d'un projet",
		EN: "the last lines of a project's journal",
	},
	"devcli.sync.help": {
		FR: "git pull puis dépendances",
		EN: "git pull then dependencies",
	},
	"devcli.attach.help": {
		FR: "la commande tmux qui ouvre la fenêtre d'un projet",
		EN: "the tmux command that opens a project's window",
	},
	"devcli.branch.help": {
		FR: "la branche de chaque dépôt, ou change de branche",
		EN: "each repository's branch, or switches branch",
	},
	"devcli.db.help": {
		FR: "la base locale",
		EN: "the local database",
	},
	"devcli.doctor.help": {
		FR: "diagnostic court",
		EN: "a short diagnosis",
	},
	"devcli.sync.pulled": {
		FR: "pull",
		EN: "pull",
	},
	"devcli.sync.uptodate": {
		FR: "déjà à jour",
		EN: "already up to date",
	},
	"devcli.sync.installed": {
		FR: "dépendances",
		EN: "dependencies",
	},
	"devcli.sync.unchanged": {
		FR: "dépendances inchangées",
		EN: "dependencies unchanged",
	},
	"devcli.branch.norepo": {
		FR: "%s n'est pas dans un dépôt git",
		EN: "%s is not in a git repository",
	},
	"devcli.branch.dirty": {
		FR: "modifications non commitées",
		EN: "uncommitted changes",
	},
	"daemon.version.none": {
		FR: "aucune",
		EN: "none",
	},
}
