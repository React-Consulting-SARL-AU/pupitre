export const onboarding = {
  en: {
    "onboarding.thisServer": "This server",
    "onboarding.finish": "Finish",

    "onboarding.agent.title": "Agent",
    "onboarding.agent.readCatalog": "Choose the services",
    "onboarding.agent.inPlace": "Agent in place",
    "onboarding.agent.sendingTitle": "Installing the agent",
    "onboarding.agent.sendingDetail": "A minute at most.",

    "onboarding.agent.phase.reading": "Looking at the machine",
    "onboarding.agent.phase.enrolling": "Declaring it to your account",
    "onboarding.agent.phase.sending": "Copying the agent",
    "onboarding.agent.phase.starting": "Starting it",

    "onboarding.done.title": "Ready",
    "onboarding.done.connectedAs": "Connected as",
    "onboarding.done.rootClosed":
      "Root access is closed: no one gets onto this machine with that account.",
    "onboarding.done.rootKept":
      "Root access stayed open, as you asked: by key only.",
    "onboarding.done.rootOpen":
      "Root access stayed open: run the securing again once the cause is settled.",

    "onboarding.organization.title": "Enrolled for {organization}",
    "onboarding.organization.role": "Your role there: {role}.",
    "onboarding.organization.none": "No active organization",
    "onboarding.organization.noneDetail":
      "Pick an organization in the console before enrolling a server.",
    "onboarding.organization.switchLabel": "Enrol for another organization",
    "onboarding.enrollment.title": "Server declared",

    "onboarding.entry.unfinished": "L'installation n'est pas terminée.",
    "onboarding.entry.noAgent": "Not installed yet.",
    "onboarding.entry.resume": "Resume the install",
    "onboarding.entry.install": "Install Pupitre",

    "onboarding.flow.back": "Back",
    "onboarding.flow.quit": "Quit the assistant",
    "onboarding.flow.progress": "Progress",
    "onboarding.flow.stepCount": "Step {index} of {total}",

    "onboarding.harden.title": "Security",
    "onboarding.harden.description":
      "Pupitre creates a working account, checks it can get in, then closes root access.",
    "onboarding.harden.queuedTitle": "Waiting for the previous step",
    "onboarding.harden.queuedDetail":
      "Securing starts as soon as the server answers.",
    "onboarding.harden.runningTitle": "Securing the server",
    "onboarding.harden.runningDetail":
      "Working account, keys copied over, connection checked, root access closed.",
    "onboarding.harden.switchingTitle": "Switching account",
    "onboarding.harden.switchingDetail":
      "The app reconnects with the account {user}.",
    "onboarding.harden.rootClosedTitle": "Root access is closed.",
    "onboarding.harden.rootKeptTitle":
      "The server is secured, and root access stays open.",
    "onboarding.harden.rootKeptDetail":
      "You chose to keep it: it opens with a key, never with a password.",
    "onboarding.harden.connectedPrefix":
      "The app now connects to it with the account",
    "onboarding.harden.connectedSuffix": ".",
    "onboarding.harden.noReason":
      "Root access was not closed, and no reason was given.",
    "onboarding.harden.rootOpenPrefix":
      "Root access stays open and nothing changed on the machine: the account",
    "onboarding.harden.rootOpenSuffix": "is the one the app keeps using.",
    "onboarding.harden.continueOpen": "Continue without closing it",
    "onboarding.harden.failedOpen":
      "The machine is installed and root is still open: the app keeps using that account, and everything else works. You can retry above, or go on now and leave it open.",

    "onboarding.inspection.title": "Inspection",
    "onboarding.inspection.pickAnother": "Choose another server",
    "onboarding.inspection.install": "Install",
    "onboarding.inspection.update": "Update",
    "onboarding.inspection.continue": "Continue",
    "onboarding.inspection.installAnyway": "Install anyway",
    "onboarding.inspection.rerun": "Run again",
    "onboarding.inspection.waitingTitle": "Looking at the machine",
    "onboarding.inspection.waitingDetail": "A few seconds.",

    "onboarding.summary.distribution": "Distribution",
    "onboarding.summary.architecture": "Architecture",
    "onboarding.summary.memory": "Memory",
    "onboarding.summary.diskFree": "Free disk",

    "onboarding.verdict.bare.title": "Ready to be installed",
    "onboarding.verdict.bare.lead": "Nothing is installed on this server.",
    "onboarding.verdict.managed.title": "Already managed by Pupitre",
    "onboarding.verdict.managed.lead": "The agent answers on this server.",
    "onboarding.verdict.occupied.title": "Server already in use",
    "onboarding.verdict.occupied.lead":
      "Other software already lives here. Pupitre won't touch it, but it will stay.",
    "onboarding.verdict.incompatible.title": "Incompatible server",
    "onboarding.verdict.incompatible.lead":
      "Pupitre cannot install on this machine as it stands.",
    "onboarding.verdict.updateAvailable":
      "A newer version of the agent is available.",
    "onboarding.verdict.upToDate": "The agent is up to date.",
    "onboarding.verdict.reasonsLabel": "What we saw",
    "onboarding.verdict.fixesLabel": "What would let us go on",

    "onboarding.stage.pick": "Choose",
    "onboarding.stage.add": "Add",
    "onboarding.stage.key": "Key",
    "onboarding.failure.journal": "See the journal",
    "onboarding.channel.lost": "Connection to {name} lost.",
    "onboarding.channel.retrying": "Trying again…",
    "onboarding.channel.back": "Connection to {name} is back.",
    "onboarding.usage.held":
      "Your subscription could not be checked: the install is waiting.",
    "onboarding.step.agent": "Agent",
    "onboarding.step.catalog": "Services",
    "onboarding.step.config": "Configuration",
    "onboarding.step.done": "Ready",
    "onboarding.step.harden": "Security",
    "onboarding.step.install": "Installation",
    "onboarding.step.inspection": "Inspection",
    "onboarding.step.server": "Server",
    "onboarding.step.restore": "Backup",
    "onboarding.step.data": "Data",

    "onboarding.restore.title": "Start from a backup?",
    "onboarding.restore.backups": "Backups of the organization",
    "onboarding.restore.backupLabel": "{server} — {date}",
    "onboarding.restore.backupLabelNamed": "{server} — {name}, {date}",
    "onboarding.restore.passphraseHelp":
      "Checked on this computer before the server is asked anything.",
    "onboarding.restore.needsConnection":
      "Connect the backup bucket to start from a backup.",
    "onboarding.restore.needsPassphrase":
      "Type the backup passphrase to start from a backup.",
    "onboarding.restore.skip": "Start from an empty server",
    "onboarding.restore.start": "Start from this backup",
    "onboarding.restore.running":
      "Putting the backup's configuration on the server",

    "onboarding.harden.toData": "Go on to the data",
    "onboarding.data.title": "Data",
    "onboarding.data.parts": "What comes back from the backup",
    "onboarding.data.passphraseHelp":
      "The app was closed since the backup was chosen: its key has to be derived again.",
    "onboarding.data.skip": "Leave the data in the bucket",
    "onboarding.data.start.one": "Bring back {count} part",
    "onboarding.data.start.other": "Bring back {count} parts",
    "onboarding.data.running":
      "Bringing the data back, then starting the projects",
    "onboarding.data.done": "The data is back and the projects are started.",
    "onboarding.data.continue": "Finish",

    "onboarding.replay.notice":
      "{name} had a password or a key the app did not keep. Enter it again, or let the app generate one, before running it again.",
    "onboarding.server.pick.title": "The machine to install",
    "onboarding.server.add.title": "The machine to install",
    "onboarding.server.key.title": "The key that opens it",
    "onboarding.server.knownHeading": "Your servers",

    "onboarding.config.replaySubmit": "Replay this module",
    "onboarding.config.resumeSubmit": "Resume the install",

    "onboarding.resume.readingTitle": "Checking where the server stands",
    "onboarding.resume.readingDetail":
      "The install had been interrupted: what is already in place is checked before going on.",
    "onboarding.resume.notice":
      "The install stopped before {modules}. Their passwords were not kept: enter them again, or let the app generate them, and the install picks up where it stopped.",
  },
  fr: {
    "onboarding.thisServer": "Ce serveur",
    "onboarding.finish": "Terminer",

    "onboarding.agent.title": "Agent",
    "onboarding.agent.readCatalog": "Choisir les services",
    "onboarding.agent.inPlace": "Agent en place",
    "onboarding.agent.sendingTitle": "Installation de l'agent",
    "onboarding.agent.sendingDetail": "Une minute au plus.",

    "onboarding.agent.phase.reading": "On regarde la machine",
    "onboarding.agent.phase.enrolling": "On la déclare à votre compte",
    "onboarding.agent.phase.sending": "On copie l'agent",
    "onboarding.agent.phase.starting": "On le démarre",

    "onboarding.done.title": "Prêt",
    "onboarding.done.connectedAs": "Connecté en",
    "onboarding.done.rootClosed":
      "L'accès root est fermé : plus personne n'entre sur cette machine avec ce compte.",
    "onboarding.done.rootKept":
      "L'accès root est resté ouvert, comme demandé : par clé seulement.",
    "onboarding.done.rootOpen":
      "L'accès root est resté ouvert : relancez la sécurisation une fois la cause réglée.",

    "onboarding.organization.title": "Enrôlé pour {organization}",
    "onboarding.organization.role": "Votre rôle : {role}.",
    "onboarding.organization.none": "Aucune organisation active",
    "onboarding.organization.noneDetail":
      "Choisissez une organisation dans la console avant d'enrôler un serveur.",
    "onboarding.organization.switchLabel":
      "Enrôler pour une autre organisation",
    "onboarding.enrollment.title": "Serveur déclaré",

    "onboarding.entry.unfinished": "L'installation n'est pas terminée.",
    "onboarding.entry.noAgent": "Pas encore installé.",
    "onboarding.entry.resume": "Reprendre l'installation",
    "onboarding.entry.install": "Installer Pupitre",

    "onboarding.flow.back": "Revenir",
    "onboarding.flow.quit": "Quitter l'assistant",
    "onboarding.flow.progress": "Avancement",
    "onboarding.flow.stepCount": "Étape {index} sur {total}",

    "onboarding.harden.title": "Sécurité",
    "onboarding.harden.description":
      "Pupitre crée un compte de travail, vérifie qu'il peut y entrer, puis ferme l'accès root.",
    "onboarding.harden.queuedTitle": "On attend l'étape précédente",
    "onboarding.harden.queuedDetail":
      "La sécurisation commence dès que le serveur répond.",
    "onboarding.harden.runningTitle": "On sécurise le serveur",
    "onboarding.harden.runningDetail":
      "Compte de travail, clés recopiées, connexion vérifiée, accès root fermé.",
    "onboarding.harden.switchingTitle": "On change de compte",
    "onboarding.harden.switchingDetail":
      "L'app se reconnecte avec le compte {user}.",
    "onboarding.harden.rootClosedTitle": "L'accès root est fermé.",
    "onboarding.harden.rootKeptTitle":
      "Le serveur est sécurisé, et l'accès root reste ouvert.",
    "onboarding.harden.rootKeptDetail":
      "Vous avez choisi de le garder : il s'ouvre avec une clé, jamais avec un mot de passe.",
    "onboarding.harden.connectedPrefix":
      "L'app s'y connecte maintenant avec le compte",
    "onboarding.harden.connectedSuffix": ".",
    "onboarding.harden.noReason":
      "L'accès root n'a pas été fermé, sans raison donnée.",
    "onboarding.harden.rootOpenPrefix":
      "L'accès root reste ouvert et rien n'a changé sur la machine : le compte",
    "onboarding.harden.rootOpenSuffix":
      "est celui que l'app continue d'utiliser.",
    "onboarding.harden.continueOpen": "Continuer sans le fermer",
    "onboarding.harden.failedOpen":
      "La machine est installée et root est encore ouvert : l'app continue d'utiliser ce compte, et tout le reste fonctionne. Vous pouvez réessayer au-dessus, ou continuer maintenant en le laissant ouvert.",

    "onboarding.inspection.title": "Inspection",
    "onboarding.inspection.pickAnother": "Choisir un autre serveur",
    "onboarding.inspection.install": "Installer",
    "onboarding.inspection.update": "Mettre à jour",
    "onboarding.inspection.continue": "Continuer",
    "onboarding.inspection.installAnyway": "Installer quand même",
    "onboarding.inspection.rerun": "Relancer",
    "onboarding.inspection.waitingTitle": "On regarde la machine",
    "onboarding.inspection.waitingDetail": "Quelques secondes.",

    "onboarding.summary.distribution": "Distribution",
    "onboarding.summary.architecture": "Architecture",
    "onboarding.summary.memory": "Mémoire",
    "onboarding.summary.diskFree": "Disque libre",

    "onboarding.verdict.bare.title": "Prête à être installée",
    "onboarding.verdict.bare.lead": "Rien n'est installé sur ce serveur.",
    "onboarding.verdict.managed.title": "Déjà géré par Pupitre",
    "onboarding.verdict.managed.lead": "L'agent répond sur ce serveur.",
    "onboarding.verdict.occupied.title": "Serveur déjà utilisé",
    "onboarding.verdict.occupied.lead":
      "D'autres logiciels vivent déjà ici. Pupitre n'y touchera pas, mais ils resteront.",
    "onboarding.verdict.incompatible.title": "Serveur incompatible",
    "onboarding.verdict.incompatible.lead":
      "Pupitre ne peut pas s'installer sur cette machine en l'état.",
    "onboarding.verdict.updateAvailable":
      "Une version plus récente de l'agent est disponible.",
    "onboarding.verdict.upToDate": "L'agent est à jour.",
    "onboarding.verdict.reasonsLabel": "Ce qu'on a vu",
    "onboarding.verdict.fixesLabel": "Ce qui permettrait de continuer",

    "onboarding.stage.pick": "Choisir",
    "onboarding.stage.add": "Ajouter",
    "onboarding.stage.key": "Clé",
    "onboarding.failure.journal": "Voir le journal",
    "onboarding.channel.lost": "Connexion à {name} perdue.",
    "onboarding.channel.retrying": "Nouvelle tentative…",
    "onboarding.channel.back": "Connexion à {name} rétablie.",
    "onboarding.usage.held":
      "Votre abonnement n'a pas pu être vérifié : l'installation attend.",
    "onboarding.step.agent": "Agent",
    "onboarding.step.catalog": "Services",
    "onboarding.step.config": "Configuration",
    "onboarding.step.done": "Prêt",
    "onboarding.step.harden": "Sécurité",
    "onboarding.step.install": "Installation",
    "onboarding.step.inspection": "Inspection",
    "onboarding.step.server": "Serveur",
    "onboarding.step.restore": "Sauvegarde",
    "onboarding.step.data": "Données",

    "onboarding.restore.title": "Repartir d'une sauvegarde ?",
    "onboarding.restore.backups": "Sauvegardes de l'organisation",
    "onboarding.restore.backupLabel": "{server} — {date}",
    "onboarding.restore.backupLabelNamed": "{server} — {name}, {date}",
    "onboarding.restore.passphraseHelp":
      "Vérifiée sur cet ordinateur avant que le serveur ne reçoive quoi que ce soit.",
    "onboarding.restore.needsConnection":
      "Connectez le seau des sauvegardes pour repartir d'une sauvegarde.",
    "onboarding.restore.needsPassphrase":
      "Tapez la phrase de passe des sauvegardes pour repartir d'une sauvegarde.",
    "onboarding.restore.skip": "Partir d'un serveur vierge",
    "onboarding.restore.start": "Repartir de cette sauvegarde",
    "onboarding.restore.running":
      "Pose de la configuration de la sauvegarde sur le serveur",

    "onboarding.harden.toData": "Passer aux données",
    "onboarding.data.title": "Données",
    "onboarding.data.parts": "Ce qui revient de la sauvegarde",
    "onboarding.data.passphraseHelp":
      "L'app a été fermée depuis le choix de la sauvegarde : sa clé doit être dérivée à nouveau.",
    "onboarding.data.skip": "Laisser les données dans le seau",
    "onboarding.data.start.one": "Ramener {count} partie",
    "onboarding.data.start.other": "Ramener {count} parties",
    "onboarding.data.running": "Retour des données, puis démarrage des projets",
    "onboarding.data.done":
      "Les données sont revenues et les projets sont démarrés.",
    "onboarding.data.continue": "Terminer",

    "onboarding.replay.notice":
      "{name} avait un mot de passe ou une clé que l'app n'a pas gardés. Saisissez-le à nouveau, ou laissez l'app en générer un, avant de relancer.",
    "onboarding.server.pick.title": "La machine à installer",
    "onboarding.server.add.title": "La machine à installer",
    "onboarding.server.key.title": "La clé qui l'ouvre",
    "onboarding.server.knownHeading": "Vos serveurs",

    "onboarding.config.replaySubmit": "Rejouer ce module",
    "onboarding.config.resumeSubmit": "Reprendre l'installation",

    "onboarding.resume.readingTitle": "On regarde où en est le serveur",
    "onboarding.resume.readingDetail":
      "L'installation avait été interrompue : on vérifie ce qui est déjà en place avant de reprendre.",
    "onboarding.resume.notice":
      "L'installation s'est arrêtée avant {modules}. Leurs mots de passe n'ont pas été conservés : saisissez-les à nouveau, ou laissez l'app en générer, et l'installation reprend là où elle s'était arrêtée.",
  },
} as const;
