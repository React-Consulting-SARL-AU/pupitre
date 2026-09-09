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
	"daemon.token.missing.fix": {
		FR: "Réinstalle ce serveur depuis l'app pour lui rendre un jeton de serveur.",
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
		FR: "Démarre-le avec project.up : le journal naît au premier démarrage.",
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
		FR: "Appelle project.list pour la liste des projets déclarés.",
		EN: "Call project.list for the list of declared projects.",
	},
	"devcli.project.unknown.fix": {
		FR: "Liste les projets avec pupitred dev status.",
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
		FR: "Versionne un %s dans %s, ou un %s si le projet garde ses secrets dans 1Password.",
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
		FR: "Écris les secrets groupés par identifiant de module, comme config : {\"<module id>\": {\"<clé>\": \"<valeur>\"}}.",
		EN: "Write the secrets grouped by module identifier, like config: {\"<module id>\": {\"<key>\": \"<value>\"}}.",
	},
	"daemon.enroll.token.fix": {
		FR: "Écris le jeton d'enrôlement sur la ligne suivante, sous la forme {\"enrollment_token\": \"<jeton>\"}.",
		EN: "Write the enrolment token on the next line, as {\"enrollment_token\": \"<token>\"}.",
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
}
