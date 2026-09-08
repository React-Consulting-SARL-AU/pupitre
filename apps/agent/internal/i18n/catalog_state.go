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
		FR: "Vérifie que la machine a le droit de lire ce dépôt : ssh -T git@github.com.",
		EN: "Check that the machine may read this repository: ssh -T git@github.com.",
	},
	"state.checkout.failed": {
		FR: "%s : le passage sur %s a échoué",
		EN: "%s: switching to %s failed",
	},
	"state.git.read.fix": {
		FR: "Ouvre un terminal sur %s et lis ce que git répond.",
		EN: "Open a terminal on %s and read what git answers.",
	},
	"state.project.clone.failed": {
		FR: "%s : le clonage de %s a échoué",
		EN: "%s: cloning %s failed",
	},
	"state.pull.conflict": {
		FR: "%s : le pull a laissé un conflit",
		EN: "%s: the pull left a conflict",
	},
	"state.pull.conflict.fix": {
		FR: "Ouvre un terminal sur %s et résous-le à la main.",
		EN: "Open a terminal on %s and resolve it by hand.",
	},
	"state.project.notInGit": {
		FR: "%s n'est pas dans un dépôt git",
		EN: "%s is not in a git repository",
	},
	"state.project.sync.fix": {
		FR: "Récupère les sources avec project.sync %s.",
		EN: "Fetch the sources with project.sync %s.",
	},
	"state.process.kill.failed": {
		FR: "impossible d'arrêter %s",
		EN: "%s could not be stopped",
	},
	"state.process.kill.failed.fix": {
		FR: "Regarde s'il s'est terminé seul avec processes.list.",
		EN: "Check with processes.list whether it ended on its own.",
	},
	"state.pid.refused": {
		FR: "pid refusé : %s",
		EN: "pid refused: %s",
	},
	"state.project.dir.missing": {
		FR: "%s : le dossier %s est absent",
		EN: "%s: the folder %s is missing",
	},
	"state.project.install.failed": {
		FR: "%s : %s a échoué",
		EN: "%s: %s failed",
	},
	"state.project.install.failed.fix": {
		FR: "Ouvre le journal du projet, ou corrige la colonne install du registre.",
		EN: "Open the project's journal, or fix the install column of the registry.",
	},
	"state.service.unknown": {
		FR: "service inconnu : %s",
		EN: "unknown service: %s",
	},
	"state.service.unknown.fix": {
		FR: "Appelle catalog pour la liste des modules de ce serveur.",
		EN: "Call catalog for the list of this server's modules.",
	},
	"state.secret.foreign": {
		FR: "la clé %s n'appartient pas à %s",
		EN: "the key %s does not belong to %s",
	},
	"state.secret.foreign.fix": {
		FR: "Appelle service.status %s pour la liste de ses identifiants.",
		EN: "Call service.status %s for the list of its credentials.",
	},
	"state.secret.missing": {
		FR: "aucune valeur enregistrée pour %s",
		EN: "no value stored for %s",
	},
	"state.secret.missing.fix": {
		FR: "Enregistre la valeur avec secrets.set, ou réinstalle %s.",
		EN: "Store the value with secrets.set, or reinstall %s.",
	},
	"state.shot.unknown": {
		FR: "capture inconnue : %s",
		EN: "unknown capture: %s",
	},
	"state.shot.unknown.fix": {
		FR: "Appelle shots.list et reprends le path d'une de ses entrées, tel quel.",
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
		FR: "Ouvre la galerie sur le serveur pour cette capture, ou reprends-en une plus légère.",
		EN: "Open the gallery on the server for this capture, or take a lighter one.",
	},
	"state.shot.unreadable": {
		FR: "capture illisible : %s",
		EN: "the capture cannot be read: %s",
	},
	"state.reboot.refused": {
		FR: "le redémarrage a été refusé",
		EN: "the restart was refused",
	},
	"state.reboot.refused.fix": {
		FR: "Connecte-toi en SSH et lance sudo systemctl reboot.",
		EN: "Sign in over SSH and run sudo systemctl reboot.",
	},
	"state.path.unreadable": {
		FR: "chemin illisible",
		EN: "the path cannot be read",
	},
	"state.path.unreadable.fix": {
		FR: "Donne un chemin relatif à la racine des projets.",
		EN: "Give a path relative to the projects root.",
	},
	"state.path.absolute": {
		FR: "chemin absolu refusé : %s",
		EN: "absolute path refused: %s",
	},
	"state.path.absolute.fix": {
		FR: "Donne un chemin relatif à la racine des projets, par exemple flymate/api.",
		EN: "Give a path relative to the projects root, for example flymate/api.",
	},
	"state.path.outside": {
		FR: "chemin hors de la racine des projets : %s",
		EN: "the path leaves the projects root: %s",
	},
	"state.path.outside.fix": {
		FR: "Reste sous la racine des projets, sans « .. ».",
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
		FR: "Donne le dépôt à cloner, ou le dossier déjà présent sur le serveur.",
		EN: "Give the repository to clone, or the folder already on the server.",
	},
	"state.dir.outside": {
		FR: "dossier hors de la racine des projets : %s",
		EN: "the folder is outside the projects root: %s",
	},
	"state.dir.outside.fix": {
		FR: "Donne un chemin relatif à la racine des projets, sans « .. ».",
		EN: `Give a path relative to the projects root, without "..".`,
	},
	"state.dir.absent": {
		FR: "dossier absent : %s",
		EN: "folder missing: %s",
	},
	"state.dir.absent.fix": {
		FR: "Vérifie le chemin avec completions, ou donne le dépôt à cloner.",
		EN: "Check the path with completions, or give the repository to clone.",
	},
	"state.repo.invalid": {
		FR: "dépôt invalide : %s",
		EN: "invalid repository: %s",
	},
	"state.repo.invalid.fix": {
		FR: "Donne une adresse de dépôt, pas une option de git.",
		EN: "Give a repository address, not a git option.",
	},
	"state.branch.invalid": {
		FR: "nom de branche invalide : %s",
		EN: "invalid branch name: %s",
	},
	"state.branch.invalid.fix": {
		FR: "Lettres, chiffres, point, tiret, souligné et barre oblique.",
		EN: "Letters, digits, dot, dash, underscore and slash.",
	},
	"state.tree.dirty": {
		FR: "%s a des modifications non validées",
		EN: "%s has uncommitted changes",
	},
	"state.tree.dirty.fix": {
		FR: "Valide-les, mets-les de côté avec git stash, ou annule-les avant de changer de branche.",
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
		FR: "patch tronqué — ouvre-le dans un terminal pour le lire en entier",
		EN: "the patch is truncated — open it in a terminal to read it in full",
	},
	"state.pid.refused.fix": {
		FR: "Donne le pid d'une ligne de processes.list.",
		EN: "Give the pid of a row of processes.list.",
	},
	"state.pid.gone.fix": {
		FR: "Rafraîchis la liste : ce processus n'existe plus.",
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
		FR: "Arrête le projet avec project.down, ou ferme le terminal.",
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
		FR: "Installe le module qui fournit %s, la liste vient de catalog.",
		EN: "Install the module that provides %s, the list comes from catalog.",
	},
	"state.doctor.service.fix": {
		FR: "Lis son état avec service.status %s.",
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
}
