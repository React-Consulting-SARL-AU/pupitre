export const onboarding = {
  en: {
    "onboarding.thisServer": "This server",
    "onboarding.finish": "Finish",

    "onboarding.agent.eyebrow": "Agent",
    "onboarding.agent.description":
      "Pupitre first puts its agent on the server: it is the agent that does everything else.",
    "onboarding.agent.readCatalog": "Choose the services",
    "onboarding.agent.inPlace": "Agent in place",
    "onboarding.agent.sendingTitle": "Installing the agent",
    "onboarding.agent.sendingDetail":
      "The server is declared to your account, then the agent is copied onto it. A minute at most.",
    "onboarding.agent.sendingNote":
      "The server is enrolled with the console, then the signed binary travels over the SSH connection already open and installs into /usr/local/bin. Its checksum is verified before going on.",

    "onboarding.agent.phase.reading": "Looking at the machine",
    "onboarding.agent.phase.enrolling": "Declaring it to your account",
    "onboarding.agent.phase.sending": "Copying the agent",
    "onboarding.agent.phase.starting": "Starting it",

    "onboarding.done.eyebrow": "Ready",
    "onboarding.done.description":
      "The server is ready. Open a terminal or create a project whenever you like.",
    "onboarding.done.connectedAs": "Connected as",
    "onboarding.done.rootClosed":
      "Root access is closed: no one gets onto this machine with that account.",
    "onboarding.done.rootKept":
      "Root access stayed open, as you asked: by key only.",
    "onboarding.done.rootOpen":
      "Root access stayed open: run the securing again once the cause is settled.",

    "onboarding.enrollment.title": "Server declared",
    "onboarding.enrollment.detail":
      "It shows up in your console as soon as the agent gives a sign of life.",

    "onboarding.entry.unfinished": "The install of {name} isn't finished.",
    "onboarding.entry.noAgent": "{name} is not installed yet.",
    "onboarding.entry.detail":
      "The assistant looks at the machine, installs what you choose, then secures it.",
    "onboarding.entry.resume": "Resume the install",
    "onboarding.entry.install": "Install Pupitre",

    "onboarding.flow.back": "Back",
    "onboarding.flow.quit": "Quit the assistant",
    "onboarding.flow.progress": "Progress",
    "onboarding.flow.stepCount": "Step {index} of {total}",

    "onboarding.harden.eyebrow": "Security",
    "onboarding.harden.description":
      "Pupitre creates a working account, checks it can get in, then closes root access.",
    "onboarding.harden.queuedTitle": "Waiting for the previous step",
    "onboarding.harden.queuedDetail":
      "The server is still finishing what was asked before this. Securing starts as soon as it answers.",
    "onboarding.harden.queuedNote":
      "One command at a time on the channel that carries the long ones: the request is written but not sent, and the trace shows it as queued.",
    "onboarding.harden.runningTitle": "Securing the server",
    "onboarding.harden.runningDetail":
      "Working account, keys copied over, connection checked, root access closed.",
    "onboarding.harden.runningNote":
      "The dev account is created, the authorised keys are copied into it and a key login is checked; only then are password logins and the root login disabled. If the key does not open dev, the agent stops and says so.",
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

    "onboarding.inspection.eyebrow": "Inspection",
    "onboarding.inspection.pickAnother": "Choose another server",
    "onboarding.inspection.install": "Install",
    "onboarding.inspection.update": "Update",
    "onboarding.inspection.continue": "Continue",
    "onboarding.inspection.installAnyway": "Install anyway",
    "onboarding.inspection.rerun": "Run again",
    "onboarding.inspection.waitingDescription":
      "Pupitre looks at the machine before touching it.",
    "onboarding.inspection.found": "Here is what we found.",
    "onboarding.inspection.waitingTitle": "Looking at the machine",
    "onboarding.inspection.waitingDetail":
      "Its system, its memory, its disk, what already runs on it. A few seconds.",
    "onboarding.inspection.waitingNote":
      "The probe is a script sent on ssh's standard input and run from memory: nothing is written on the server, and a machine turned down is left exactly as it was found.",

    "onboarding.summary.distribution": "Distribution",
    "onboarding.summary.architecture": "Architecture",
    "onboarding.summary.memory": "Memory",
    "onboarding.summary.diskFree": "Free disk",

    "onboarding.verdict.bare.title": "Ready to be installed",
    "onboarding.verdict.bare.lead":
      "Nothing is installed on this server: Pupitre can take it in hand.",
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

    "onboarding.replay.notice":
      "{name} had a password or a key the app did not keep. Enter it again, or let the app generate one, before running it again.",

    "onboarding.server.eyebrow": "Server",
    "onboarding.server.pick.title": "The machine to install",
    "onboarding.server.pick.description":
      "Pick the machine to take in hand. The assistant goes on with it right away.",
    "onboarding.server.add.title": "The machine to install",
    "onboarding.server.add.description":
      "Its address and the account to get in with. The app takes care of the key.",
    "onboarding.server.key.title": "The key that opens it",
    "onboarding.server.key.description":
      "The app installs its key on the server, then connects with it. The rest follows on its own.",
    "onboarding.server.knownHeading": "Your servers",
    "onboarding.server.knownIntro": "The machines this computer already knows.",

    "onboarding.config.replaySubmit": "Replay this module",
    "onboarding.config.resumeSubmit": "Resume the install",

    "onboarding.resume.readingTitle": "Checking where the server stands",
    "onboarding.resume.readingDetail":
      "The install had been interrupted: what is already in place is checked before going on.",
    "onboarding.resume.readingNote":
      "Nothing is installed on the strength of what the app remembers: the machine is read again, and what it runs decides what is left to do.",
    "onboarding.resume.notice":
      "The install stopped before {modules}. Their passwords were not kept: enter them again, or let the app generate them, and the install picks up where it stopped.",
  },
  fr: {
    "onboarding.thisServer": "Ce serveur",
    "onboarding.finish": "Terminer",

    "onboarding.agent.eyebrow": "Agent",
    "onboarding.agent.description":
      "Pupitre installe d'abord son agent sur le serveur : c'est lui qui fera tout le reste.",
    "onboarding.agent.readCatalog": "Choisir les services",
    "onboarding.agent.inPlace": "Agent en place",
    "onboarding.agent.sendingTitle": "Installation de l'agent",
    "onboarding.agent.sendingDetail":
      "Le serveur est déclaré à votre compte, puis l'agent est copié dessus. Une minute au plus.",
    "onboarding.agent.sendingNote":
      "Le serveur est enrôlé auprès de la console, puis le binaire signé passe par la connexion SSH déjà ouverte et s'installe dans /usr/local/bin. Sa somme de contrôle est vérifiée avant la suite.",

    "onboarding.agent.phase.reading": "On regarde la machine",
    "onboarding.agent.phase.enrolling": "On la déclare à votre compte",
    "onboarding.agent.phase.sending": "On copie l'agent",
    "onboarding.agent.phase.starting": "On le démarre",

    "onboarding.done.eyebrow": "Prêt",
    "onboarding.done.description":
      "Le serveur est prêt. Ouvrez un terminal ou créez un projet quand vous voulez.",
    "onboarding.done.connectedAs": "Connecté en",
    "onboarding.done.rootClosed":
      "L'accès root est fermé : plus personne n'entre sur cette machine avec ce compte.",
    "onboarding.done.rootKept":
      "L'accès root est resté ouvert, comme demandé : par clé seulement.",
    "onboarding.done.rootOpen":
      "L'accès root est resté ouvert : relancez la sécurisation une fois la cause réglée.",

    "onboarding.enrollment.title": "Serveur déclaré",
    "onboarding.enrollment.detail":
      "Il apparaît dans votre console dès que l'agent donne signe de vie.",

    "onboarding.entry.unfinished":
      "L'installation de {name} n'est pas terminée.",
    "onboarding.entry.noAgent": "{name} n'est pas encore installé.",
    "onboarding.entry.detail":
      "L'assistant regarde la machine, installe ce que vous choisissez, puis la sécurise.",
    "onboarding.entry.resume": "Reprendre l'installation",
    "onboarding.entry.install": "Installer Pupitre",

    "onboarding.flow.back": "Revenir",
    "onboarding.flow.quit": "Quitter l'assistant",
    "onboarding.flow.progress": "Avancement",
    "onboarding.flow.stepCount": "Étape {index} sur {total}",

    "onboarding.harden.eyebrow": "Sécurité",
    "onboarding.harden.description":
      "Pupitre crée un compte de travail, vérifie qu'il peut y entrer, puis ferme l'accès root.",
    "onboarding.harden.queuedTitle": "On attend l'étape précédente",
    "onboarding.harden.queuedDetail":
      "Le serveur termine ce qui lui a été demandé avant. La sécurisation commence dès qu'il répond.",
    "onboarding.harden.queuedNote":
      "Une commande à la fois sur le canal qui porte les longues : la requête est écrite mais pas envoyée, et la trace l'indique en attente.",
    "onboarding.harden.runningTitle": "On sécurise le serveur",
    "onboarding.harden.runningDetail":
      "Compte de travail, clés recopiées, connexion vérifiée, accès root fermé.",
    "onboarding.harden.runningNote":
      "Le compte dev est créé, les clés autorisées y sont recopiées et une connexion par clé est vérifiée ; alors seulement l'authentification par mot de passe et la connexion root sont désactivées. Si la clé n'ouvre pas dev, l'agent s'arrête et le dit.",
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

    "onboarding.inspection.eyebrow": "Inspection",
    "onboarding.inspection.pickAnother": "Choisir un autre serveur",
    "onboarding.inspection.install": "Installer",
    "onboarding.inspection.update": "Mettre à jour",
    "onboarding.inspection.continue": "Continuer",
    "onboarding.inspection.installAnyway": "Installer quand même",
    "onboarding.inspection.rerun": "Relancer",
    "onboarding.inspection.waitingDescription":
      "Pupitre regarde la machine avant d'y toucher.",
    "onboarding.inspection.found": "Voici ce qu'on a trouvé.",
    "onboarding.inspection.waitingTitle": "On regarde la machine",
    "onboarding.inspection.waitingDetail":
      "Son système, sa mémoire, son disque, ce qui y tourne déjà. Quelques secondes.",
    "onboarding.inspection.waitingNote":
      "La sonde est un script envoyé sur l'entrée standard de ssh et exécuté en mémoire : rien n'est écrit sur le serveur, et une machine refusée reste exactement telle qu'elle a été trouvée.",

    "onboarding.summary.distribution": "Distribution",
    "onboarding.summary.architecture": "Architecture",
    "onboarding.summary.memory": "Mémoire",
    "onboarding.summary.diskFree": "Disque libre",

    "onboarding.verdict.bare.title": "Prête à être installée",
    "onboarding.verdict.bare.lead":
      "Rien n'est installé sur ce serveur : Pupitre peut le prendre en main.",
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

    "onboarding.replay.notice":
      "{name} avait un mot de passe ou une clé que l'app n'a pas gardés. Saisissez-le à nouveau, ou laissez l'app en générer un, avant de relancer.",

    "onboarding.server.eyebrow": "Serveur",
    "onboarding.server.pick.title": "La machine à installer",
    "onboarding.server.pick.description":
      "Choisissez la machine à prendre en main. L'assistant continue avec elle aussitôt.",
    "onboarding.server.add.title": "La machine à installer",
    "onboarding.server.add.description":
      "Son adresse et le compte pour y entrer. L'app s'occupe de la clé.",
    "onboarding.server.key.title": "La clé qui l'ouvre",
    "onboarding.server.key.description":
      "L'app installe sa clé sur le serveur, puis s'y connecte. La suite vient toute seule.",
    "onboarding.server.knownHeading": "Vos serveurs",
    "onboarding.server.knownIntro":
      "Les machines que cet ordinateur connaît déjà.",

    "onboarding.config.replaySubmit": "Rejouer ce module",
    "onboarding.config.resumeSubmit": "Reprendre l'installation",

    "onboarding.resume.readingTitle": "On regarde où en est le serveur",
    "onboarding.resume.readingDetail":
      "L'installation avait été interrompue : on vérifie ce qui est déjà en place avant de reprendre.",
    "onboarding.resume.readingNote":
      "Rien n'est installé sur la foi de ce que l'app se rappelle : la machine est relue, et ce qu'elle fait tourner décide de ce qui reste à faire.",
    "onboarding.resume.notice":
      "L'installation s'est arrêtée avant {modules}. Leurs mots de passe n'ont pas été conservés : saisissez-les à nouveau, ou laissez l'app en générer, et l'installation reprend là où elle s'était arrêtée.",
  },
} as const;
