package i18n

// The machine's state: projects, repositories, processes, secrets, captures.
var stateCatalog = map[string]Message{
	"state.agent.unknown": {
		FR: "agent inconnu : %s",
		EN: "unknown agent: %s",
	},
	"state.agent.unknown.fix": {
		FR: "Les agents sont %s.",
		EN: "The agents are %s.",
	},
	"state.clone.failed": {
		FR: "le clonage de %s a échoué",
		EN: "cloning %s failed",
	},
	"state.repo.unreadable.fix": {
		FR: "Vérifiez que la machine a le droit de lire ce dépôt : ssh -T git@github.com.",
		EN: "Check that the machine may read this repository: ssh -T git@github.com.",
	},
	"state.git.said": {
		FR: "git répond : %s",
		EN: "git says: %s",
	},
	"state.checkout.failed": {
		FR: "%s : le passage sur %s a échoué",
		EN: "%s: switching to %s failed",
	},
	"state.git.read.fix": {
		FR: "Ouvrez un terminal sur %s et lisez ce que git répond.",
		EN: "Open a terminal on %s and read what git answers.",
	},
	"state.project.clone.failed": {
		FR: "%s : le clonage de %s a échoué",
		EN: "%s: cloning %s failed",
	},
	"state.pull.failed": {
		FR: "%s : le pull a échoué dans %s",
		EN: "%s: the pull failed in %s",
	},
	"state.project.repo.other": {
		FR: "%s : le dossier tient déjà un autre dépôt, %s",
		EN: "%s: the folder already holds another repository, %s",
	},
	"state.project.repo.other.fix": {
		FR: "Videz %s, ou déclarez le projet dans un autre dossier ; il attend %s.",
		EN: "Empty %s, or declare the project in another folder; it expects %s.",
	},
	"state.project.notInGit": {
		FR: "%s n'est pas dans un dépôt git",
		EN: "%s is not in a git repository",
	},
	"state.project.runtime.unknown": {
		FR: "%s n'est pas un runtime du catalogue",
		EN: "%s is not a runtime of the catalogue",
	},
	"state.project.runtime.unknown.fix": {
		FR: "Nommez l'un de %s.",
		EN: "Name one of %s.",
	},
	"state.project.runtime.missing": {
		FR: "%s %s n'est pas installé sur ce serveur",
		EN: "%s %s is not installed on this server",
	},
	"state.project.runtime.missing.fix": {
		FR: "Cochez la version %s dans le service %s et appliquez, puis revenez au projet.",
		EN: "Check version %s in the %s service and apply, then come back to the project.",
	},
	"state.project.sync.fix": {
		FR: "Récupérez les sources avec project.sync %s.",
		EN: "Fetch the sources with project.sync %s.",
	},
	"state.process.kill.failed": {
		FR: "impossible d'arrêter %s",
		EN: "%s could not be stopped",
	},
	"state.process.kill.failed.fix": {
		FR: "Regardez s'il s'est terminé seul avec processes.list.",
		EN: "Check with processes.list whether it ended on its own.",
	},
	"state.pid.refused": {
		FR: "pid refusé : %s",
		EN: "pid refused: %s",
	},
	"state.process.unknown": {
		FR: "le processus %s n'existe pas dans le projet %s",
		EN: "process %s does not exist in project %s",
	},
	"state.process.unknown.fix": {
		FR: "Nommez un processus que le projet déclare : ils sont listés par project.list.",
		EN: "Name a process the project declares: project.list lists them.",
	},
	"state.project.dir.busy": {
		FR: "%s : le dossier %s existe déjà et n'est pas vide",
		EN: "%s: the folder %s already exists and is not empty",
	},
	"state.project.dir.busy.fix": {
		FR: "Videz ce dossier ou choisissez-en un autre : %s sera cloné dedans.",
		EN: "Empty that folder or choose another one: %s will be cloned into it.",
	},
	"state.project.dir.missing": {
		FR: "%s : le dossier %s est absent",
		EN: "%s: the folder %s is missing",
	},
	"state.project.install.failed": {
		FR: "%s : %s a échoué",
		EN: "%s: %s failed",
	},
	"state.project.busy": {
		FR: "une installation, une synchronisation ou un pull tourne déjà sur cette machine",
		EN: "an install, a sync or a pull is already running on this machine",
	},
	"state.project.busy.fix": {
		FR: "laissez-la finir, puis relancez : deux exécutions dans les mêmes dossiers se corrompent l'une l'autre",
		EN: "let it finish, then run yours again: two runs in the same directories corrupt each other",
	},
	"state.debug.service": {
		FR: "%s est un service : systemd le tient, pas une fenêtre tmux",
		EN: "%s is a service: systemd holds it, not a tmux window",
	},
	"state.debug.service.fix": {
		FR: "Déboguer ne vaut que pour un projet lancé par la stack.",
		EN: "Debugging only applies to a project the stack starts.",
	},
	"state.debug.undeclared": {
		FR: "%s n'expose aucun port de débogage",
		EN: "%s exposes no debug port",
	},
	"state.debug.undeclared.fix": {
		FR: "Déclarez-le dans /etc/pupitre/env : %s=\"%s:5005\".",
		EN: "Declare it in /etc/pupitre/env: %s=\"%s:5005\".",
	},
	"state.project.install.failed.fix": {
		FR: "Ouvrez les logs du projet, ou corrigez la colonne install du registre.",
		EN: "Open the project's journal, or fix the install column of the registry.",
	},
	"state.service.unknown": {
		FR: "service inconnu : %s",
		EN: "unknown service: %s",
	},
	"state.service.unknown.fix": {
		FR: "Appelez catalog pour la liste des modules de ce serveur.",
		EN: "Call catalog for the list of this server's modules.",
	},
	"state.service.noUnit": {
		FR: "%s ne tient aucun service : rien à démarrer, arrêter ou lire",
		EN: "%s holds no service: nothing to start, stop or read",
	},
	"state.service.noUnit.fix": {
		FR: "Seuls les modules qui déclarent une unité dans service.status répondent à ces commandes.",
		EN: "Only the modules that declare a unit in service.status answer these commands.",
	},
	"state.service.refused": {
		FR: "%s : systemd a refusé l'action : %s",
		EN: "%s: systemd refused the action: %s",
	},
	"state.service.refused.fix": {
		FR: "Lisez service.logs %s pour ce que l'unité a dit.",
		EN: "Read service.logs %s for what the unit said.",
	},
	"state.service.journal.unreadable": {
		FR: "%s : les logs de l'unité sont illisibles : %s",
		EN: "%s: the unit's journal cannot be read: %s",
	},
	"state.secret.foreign": {
		FR: "la clé %s n'appartient pas à %s",
		EN: "the key %s does not belong to %s",
	},
	"state.secret.foreign.fix": {
		FR: "Appelez service.status %s pour la liste de ses identifiants.",
		EN: "Call service.status %s for the list of its credentials.",
	},
	"state.secret.missing": {
		FR: "aucune valeur enregistrée pour %s",
		EN: "no value stored for %s",
	},
	"state.secret.missing.fix": {
		FR: "Enregistrez la valeur avec secrets.set, ou réinstallez %s.",
		EN: "Store the value with secrets.set, or reinstall %s.",
	},
	"state.shot.unknown": {
		FR: "capture inconnue : %s",
		EN: "unknown capture: %s",
	},
	"state.shot.unknown.fix": {
		FR: "Appelez shots.list et reprenez le path d'une de ses entrées, tel quel.",
		EN: "Call shots.list and take the path of one of its entries, as it is.",
	},
	"state.shot.notImage": {
		FR: "ce fichier n'est pas une image : %s",
		EN: "this file is not an image: %s",
	},
	"state.shot.notImage.fix": {
		FR: "La galerie ne rend que png, jpeg, gif, webp, avif et svg.",
		EN: "The gallery serves png, jpeg, gif, webp, avif and svg only.",
	},
	"state.shot.tooLarge": {
		FR: "capture trop lourde : %d octets pour un maximum de %d",
		EN: "the capture is too heavy: %d bytes for a maximum of %d",
	},
	"state.shot.tooLarge.fix": {
		FR: "Ouvrez la galerie sur le serveur pour cette capture, ou reprenez-en une plus légère.",
		EN: "Open the gallery on the server for this capture, or take a lighter one.",
	},
	"state.shot.unreadable": {
		FR: "capture illisible : %s",
		EN: "the capture cannot be read: %s",
	},
	"state.shot.removeFailed": {
		FR: "la capture %s n'a pas pu être supprimée : %s",
		EN: "the capture %s could not be removed: %s",
	},
	"state.reboot.refused": {
		FR: "le redémarrage a été refusé",
		EN: "the restart was refused",
	},
	"state.reboot.refused.fix": {
		FR: "Connectez-vous en SSH et lancez sudo systemctl reboot.",
		EN: "Sign in over SSH and run sudo systemctl reboot.",
	},
	"state.path.unreadable": {
		FR: "chemin illisible",
		EN: "the path cannot be read",
	},
	"state.path.unreadable.fix": {
		FR: "Donnez un chemin relatif à la racine des projets.",
		EN: "Give a path relative to the projects root.",
	},
	"state.path.absolute": {
		FR: "chemin absolu refusé : %s",
		EN: "absolute path refused: %s",
	},
	"state.path.absolute.fix": {
		FR: "Donnez un chemin relatif à la racine des projets, par exemple flyleaf/api.",
		EN: "Give a path relative to the projects root, for example flyleaf/api.",
	},
	"state.path.outside": {
		FR: "chemin hors de la racine des projets : %s",
		EN: "the path leaves the projects root: %s",
	},
	"state.path.outside.fix": {
		FR: "Restez sous la racine des projets, sans « .. ».",
		EN: `Stay under the projects root, without "..".`,
	},
	"state.detect.bothSources": {
		FR: "repo et dir ensemble : la détection lit une source, pas deux",
		EN: "repo and dir together: detection reads one source, not two",
	},
	"state.detect.noSource": {
		FR: "ni repo ni dir",
		EN: "neither repo nor dir",
	},
	"state.detect.source.fix": {
		FR: "Donnez le dépôt à cloner, ou le dossier déjà présent sur le serveur.",
		EN: "Give the repository to clone, or the folder already on the server.",
	},
	"state.dir.outside": {
		FR: "dossier hors de la racine des projets : %s",
		EN: "the folder is outside the projects root: %s",
	},
	"state.dir.outside.fix": {
		FR: "Donnez un chemin relatif à la racine des projets, sans « .. ».",
		EN: `Give a path relative to the projects root, without "..".`,
	},
	"state.dir.absent": {
		FR: "dossier absent : %s",
		EN: "folder missing: %s",
	},
	"state.dir.absent.fix": {
		FR: "Vérifiez le chemin avec completions, ou donnez le dépôt à cloner.",
		EN: "Check the path with completions, or give the repository to clone.",
	},
	"state.repo.invalid": {
		FR: "dépôt invalide : %s",
		EN: "invalid repository: %s",
	},
	"state.repo.invalid.fix": {
		FR: "Donnez une adresse de dépôt, pas une option de git.",
		EN: "Give a repository address, not a git option.",
	},
	"state.branch.invalid": {
		FR: "nom de branche invalide : %s",
		EN: "invalid branch name: %s",
	},
	"state.branch.invalid.fix": {
		FR: "Lettres, chiffres, point, tiret, tiret bas et slash.",
		EN: "Letters, digits, dot, dash, underscore and slash.",
	},
	"state.tree.dirty": {
		FR: "%s a des modifications non commitées",
		EN: "%s has uncommitted changes",
	},
	"state.tree.dirty.fix": {
		FR: "Commitez-les, mettez-les de côté avec git stash, ou annulez-les avant de changer de branche.",
		EN: "Commit them, set them aside with git stash, or drop them before switching branch.",
	},
	"state.remote.unreachable": {
		FR: "dépôt distant inaccessible",
		EN: "the remote repository cannot be reached",
	},
	"state.repo.root.missing": {
		FR: "dossier du dépôt introuvable",
		EN: "the repository folder cannot be found",
	},
	"state.diff.path.refused": {
		FR: "ce nom de fichier ne peut pas être transmis à git",
		EN: "this file name cannot be passed to git",
	},
	"state.diff.truncated": {
		FR: "patch tronqué — ouvrez-le dans un terminal pour le lire en entier",
		EN: "the patch is truncated — open it in a terminal to read it in full",
	},
	"state.pid.refused.fix": {
		FR: "Donnez le pid d'une ligne de processes.list.",
		EN: "Give the pid of a row of processes.list.",
	},
	"state.pid.gone.fix": {
		FR: "Rafraîchissez la liste : ce processus n'existe plus.",
		EN: "Refresh the list: this process no longer exists.",
	},
	"state.pid.foreign": {
		FR: "%s appartient à %s",
		EN: "%s belongs to %s",
	},
	"state.pid.foreign.fix": {
		FR: "Seuls les processus de %s peuvent être arrêtés depuis Pupitre.",
		EN: "Only the processes of %s can be stopped from Pupitre.",
	},
	"state.pid.carrier": {
		FR: "%s porte la session",
		EN: "%s carries the session",
	},
	"state.pid.carrier.fix": {
		FR: "Arrêtez le projet avec project.down, ou fermez le terminal.",
		EN: "Stop the project with project.down, or close the terminal.",
	},
	"state.pid.ancestor": {
		FR: "%s est un parent de l'agent",
		EN: "%s is a parent of the agent",
	},
	"state.pid.ancestor.fix": {
		FR: "L'arrêter couperait le canal par lequel l'ordre est arrivé.",
		EN: "Stopping it would cut the channel the order arrived through.",
	},
	"state.doctor.tool.fix": {
		FR: "Installez le module qui fournit %s, la liste vient de catalog.",
		EN: "Install the module that provides %s, the list comes from catalog.",
	},
	"state.doctor.service.fix": {
		FR: "Lisez son état avec service.status %s.",
		EN: "Read its state with service.status %s.",
	},
	"state.doctor.session": {
		FR: "session tmux « %s »",
		EN: `tmux session "%s"`,
	},
	"state.doctor.session.fix": {
		FR: "Elle naît au premier project.up : aucun projet n'a encore démarré.",
		EN: "It is born on the first project.up: no project has started yet.",
	},
	"state.diag.entitlement": {
		FR: "droit d'usage : %s",
		EN: "usage right: %s",
	},
	// One line, one key: the labels, the order and the units travel together — "Mo" is "MB" and "démarrée depuis" leads where "up for" follows.
	"state.diag.machine": {
		FR: "charge %.2f %.2f %.2f · mémoire %d/%d Mo · disque %.0f/%.0f Go · démarrée depuis %s",
		EN: "load %.2f %.2f %.2f · memory %d/%d MB · disk %.0f/%.0f GB · up for %s",
	},
	"state.diag.megabytes": {
		FR: "Mo",
		EN: "MB",
	},
	"state.diag.services": {
		FR: "services",
		EN: "services",
	},
	"state.diag.projects": {
		FR: "projets",
		EN: "projects",
	},
	"state.diag.sessions": {
		FR: "sessions",
		EN: "sessions",
	},
	"state.diag.doctor": {
		FR: "doctor",
		EN: "doctor",
	},
	"state.project.dir.file": {
		FR: "%s : %s est un fichier, pas un dossier",
		EN: "%s: %s is a file, not a folder",
	},
	"state.project.dir.file.fix": {
		FR: "Déplacez ce fichier, ou déclarez un autre dossier.",
		EN: "Move that file away, or declare another folder.",
	},
	"state.project.warning.hosts": {
		FR: "/etc/hosts n'a pas pu être mis à jour : %s",
		EN: "/etc/hosts could not be updated: %s",
	},
	"state.project.warning.dir": {
		FR: "un dossier de processus n'a pas pu être créé : %s",
		EN: "a process folder could not be created: %s",
	},
	"state.project.warning.pin": {
		FR: "les versions épinglées des runtimes n'ont pas pu être écrites : %s",
		EN: "the runtime pin could not be written: %s",
	},
	"state.project.warning.stop": {
		FR: "%s n'a pas pu être arrêté : %s",
		EN: "%s could not be stopped: %s",
	},
	"state.project.warning.start": {
		FR: "%s n'a pas pu démarrer sur sa nouvelle commande et reste arrêté : %s",
		EN: "%s could not start on its new command and is left stopped: %s",
	},
	"state.registry.busy": {
		FR: "le registre des projets est tenu par une autre commande",
		EN: "the project registry is held by another command",
	},
	"state.registry.busy.fix": {
		FR: "Réessayez dans un instant.",
		EN: "Try again in a moment.",
	},
}
