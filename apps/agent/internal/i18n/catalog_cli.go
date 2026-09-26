package i18n

var cliCatalog = map[string]Message{
	"cli.argument.unknown": {
		FR: "argument inconnu : %s",
		EN: "unknown argument: %s",
	},
	"cli.option.unknown": {
		FR: "option inconnue : %s",
		EN: "unknown option: %s",
	},
	"cli.port.unreadable": {
		FR: "port illisible : %s",
		EN: "unreadable port: %s",
	},
	"cli.install.unreadable": {
		FR: "%s illisible : %s",
		EN: "%s cannot be read: %s",
	},
	"cli.install.nothing": {
		FR: "aucun module à installer : %s est absent et --only n'est pas donné.",
		EN: "no module to install: %s is absent and --only is not given.",
	},
	"cli.install.nothing.fix": {
		FR: "Lancez l'installation depuis l'app, ou passez --only=<id>.",
		EN: "Start the installation from the app, or pass --only=<id>.",
	},
	"cli.step.done": {
		FR: "déjà fait",
		EN: "already done",
	},
	"cli.step.replay": {
		FR: "relance : %s",
		EN: "replay: %s",
	},
	"cli.summary.clean": {
		FR: "Aucune étape en échec. Rapport : %s",
		EN: "No failed step. Report: %s",
	},
	"cli.summary.failed": {
		FR: "%d étape(s) en échec :",
		EN: "%d failed step(s):",
	},
	"cli.summary.report": {
		FR: "Rapport : %s",
		EN: "Report: %s",
	},
	"cli.enroll.token.expected": {
		FR: "token de rattachement attendu sur l'entrée standard",
		EN: "enrolment token expected on standard input",
	},
	"cli.enroll.done": {
		FR: "serveur rattaché",
		EN: "server enrolled",
	},
	"cli.enroll.sync.failed": {
		FR: "premier état non lu, l'agent réessaiera : %s",
		EN: "first state not read, the agent will retry: %s",
	},
	"shot.usage": {
		FR: `usage : shot [--mobile|--size LxH] [--wait ms] [--project nom] <fichier|url> [nom]
        shot --list

La capture est rangée sous son projet : celui que --project nomme, sinon celui
du dossier courant, sinon celui qui sert l'URL capturée, sinon « sans projet ».
La dernière ligne écrite est toujours l'URL de la capture, prête à coller ;
le chemin local part sur la sortie d'erreur.
`,
		EN: `usage: shot [--mobile|--size WxH] [--wait ms] [--project name] <file|url> [name]
       shot --list

The capture is filed under its project: the one --project names, else the one
of the current folder, else the one serving the captured URL, else "unfiled".
The last line written is always the capture's URL, ready to paste;
the local path goes to the error output.
`,
	},
	"shot.project.expected": {
		FR: "--project attend le nom d'un projet",
		EN: "--project expects a project name",
	},
	"shot.projects.unread": {
		FR: "projets illisibles, capture rangée sans projet : %s",
		EN: "projects unreadable, capture filed under no project: %s",
	},
	"shot.url.unread": {
		FR: "adresse de la galerie illisible, URL locale donnée : %s",
		EN: "gallery address unreadable, local URL given: %s",
	},
	"shot.url.local": {
		FR: "la galerie n'est pas exposée : cette URL ne s'ouvre que sur le serveur (Services › Navigateur et galerie › Sous-domaine)",
		EN: "the gallery is not exposed: this URL opens on the server only (Services › Browser and gallery › Subdomain)",
	},
	"shots.project.unknown": {
		FR: "projet inconnu : %s (projets : %s)",
		EN: "unknown project: %s (projects: %s)",
	},
	"shot.file": {
		FR: "fichier : %s",
		EN: "file: %s",
	},
	"shot.size.expected": {
		FR: "--size attend une taille, par exemple 1024x768",
		EN: "--size expects a size, for example 1024x768",
	},
	"shot.wait.expected": {
		FR: "--wait attend un nombre de millisecondes",
		EN: "--wait expects a number of milliseconds",
	},
	"shot.source.expected": {
		FR: "le fichier ou l'URL à capturer manque",
		EN: "the file or URL to capture is missing",
	},
	"shots.gallery.unwritable": {
		FR: "galerie inaccessible : %s",
		EN: "the gallery cannot be written: %s",
	},
	"shots.capture.missing": {
		FR: "capture manquante : %s",
		EN: "the capture is missing: %s",
	},
	"shots.capture.failed": {
		FR: "capture impossible : %s",
		EN: "the capture failed: %s",
	},
	"shots.browser.none": {
		FR: "aucun navigateur headless installé — shot <fichier> reste disponible",
		EN: "no headless browser installed — shot <file> is still available",
	},
	"shots.file.unreadable": {
		FR: "fichier introuvable : %s",
		EN: "file not found: %s",
	},
	"shots.gallery.readonly": {
		FR: "lecture seule",
		EN: "read only",
	},
	"shots.gallery.unreadable": {
		FR: "dossier illisible",
		EN: "unreadable folder",
	},
	"shots.gallery.empty": {
		FR: "Aucune capture pour l'instant.",
		EN: "No capture yet.",
	},
	"shots.gallery.folder": {
		FR: "dossier",
		EN: "folder",
	},
	"shots.gallery.unfiled": {
		FR: "Sans projet",
		EN: "Unfiled",
	},
	"shots.size.bytes": {
		FR: "%d o",
		EN: "%d B",
	},
	"shots.size.kilobytes": {
		FR: "%d Ko",
		EN: "%d KB",
	},
}
