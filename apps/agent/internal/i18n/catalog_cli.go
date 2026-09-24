package i18n

// What the binary says on a terminal: pupitred install, shot and gallery, outside any protocol session.
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
		FR: `usage : shot [--mobile|--size LxH] [--wait ms] <fichier|url> [nom]
        shot --list

La dernière ligne écrite est toujours l'URL de la capture, prête à coller ;
le chemin local part sur la sortie d'erreur.
`,
		EN: `usage: shot [--mobile|--size WxH] [--wait ms] <file|url> [name]
       shot --list

The last line written is always the capture's URL, ready to paste;
the local path goes to the error output.
`,
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
	"shots.size.bytes": {
		FR: "%d o",
		EN: "%d B",
	},
	"shots.size.kilobytes": {
		FR: "%d Ko",
		EN: "%d KB",
	},
}
