export const onboarding = {
  en: {
    "onboarding.thisServer": "This server",
    "onboarding.finish": "Finish",

    "onboarding.accountGate.title": "Install a server",
    "onboarding.accountGate.eyebrow": "Account",
    "onboarding.accountGate.description":
      "The agent is downloaded from the platform, signed, then pushed to the server. This app no longer bundles it.",

    "onboarding.agent.eyebrow": "Agent",
    "onboarding.agent.description":
      "The services catalogue is the agent's own: it goes to the server before anything at all is asked of it.",
    "onboarding.agent.readCatalog": "Read the catalogue",
    "onboarding.agent.readingTitle": "Reading the account",
    "onboarding.agent.readingDetail":
      "This device's usage entitlement is checked before anything is sent.",
    "onboarding.agent.inPlace": "Agent in place",
    "onboarding.agent.sendingTitle": "Enrolling and sending the agent",
    "onboarding.agent.sendingDetail":
      "The server is enrolled, then the signed binary goes over the already-open SSH channel and installs into /usr/local/bin.",
    "onboarding.agent.sendingNote":
      "The checksum of what the server received is compared with the app's before going on.",

    "onboarding.done.eyebrow": "Ready",
    "onboarding.done.description":
      "The server is installed, and the app drives it through its agent.",
    "onboarding.done.connectedAs": "Connected as",
    "onboarding.done.rootClosed":
      "Root is closed: no one else gets onto this machine with this account.",
    "onboarding.done.rootOpen":
      "Root stayed open: resume hardening once the reason the agent gave is gone.",

    "onboarding.enrollment.title": "Server enrolled",
    "onboarding.enrollment.detail":
      "It shows up in the console with its heartbeat as soon as the agent talks to the platform.",

    "onboarding.entry.unfinished": "The install of {name} isn't finished.",
    "onboarding.entry.noAgent": "No known Pupitre agent on {name}.",
    "onboarding.entry.detail":
      "The assistant inspects the machine, puts the agent on it, installs the chosen services, then closes root.",
    "onboarding.entry.resume": "Resume the install",
    "onboarding.entry.install": "Install Pupitre",

    "onboarding.flow.back": "Back",
    "onboarding.flow.quit": "Quit the assistant",

    "onboarding.harden.eyebrow": "Hardening",
    "onboarding.harden.description":
      "The agent opens the dev account, checks a key gets in, then closes root. The app follows with its own SSH configuration.",
    "onboarding.harden.runningTitle": "Hardening in progress",
    "onboarding.harden.runningDetail":
      "Dev account, keys copied over, connection checked, passwords and root closed.",
    "onboarding.harden.runningNote":
      "Root is only closed if a key opens dev: otherwise the agent stops and says so.",
    "onboarding.harden.switchingTitle": "Switching the connection",
    "onboarding.harden.switchingDetail":
      "The app rewrites its SSH configuration to User {user} and reopens the channel.",
    "onboarding.harden.rootClosedTitle": "Root is closed on this server.",
    "onboarding.harden.connectedPrefix":
      "The app now connects to it with the account",
    "onboarding.harden.connectedSuffix": ", through its own SSH configuration.",
    "onboarding.harden.noReason":
      "The agent didn't close root, without giving a reason.",
    "onboarding.harden.rootOpenPrefix":
      "Root stays open and nothing was changed on the machine: the account",
    "onboarding.harden.rootOpenSuffix": "is the one the app keeps using.",
    "onboarding.harden.continueOpen": "Continue without closing root",

    "onboarding.inspection.eyebrow": "Inspection",
    "onboarding.inspection.pickAnother": "Choose another server",
    "onboarding.inspection.install": "Install",
    "onboarding.inspection.update": "Update",
    "onboarding.inspection.continue": "Continue",
    "onboarding.inspection.installAnyway": "Install anyway",
    "onboarding.inspection.rerun": "Run again",
    "onboarding.inspection.waitingDescription":
      "What the machine is, before touching it.",
    "onboarding.inspection.waitingTitle": "Inspection in progress",
    "onboarding.inspection.waitingDetail":
      "Distribution, architecture, memory, disk, listening ports, existing accounts, agent already installed.",
    "onboarding.inspection.waitingNote":
      "The probe is read from standard input: nothing is written on the server.",

    "onboarding.summary.distribution": "Distribution",
    "onboarding.summary.architecture": "Architecture",
    "onboarding.summary.memory": "Memory",
    "onboarding.summary.diskFree": "Free disk",

    "onboarding.verdict.bare.title": "Bare machine",
    "onboarding.verdict.bare.lead":
      "Nothing is installed on this server: Pupitre can take it in hand.",
    "onboarding.verdict.managed.title": "Already managed by Pupitre",
    "onboarding.verdict.managed.lead": "The agent answers on this server.",
    "onboarding.verdict.occupied.title": "Server in use",
    "onboarding.verdict.occupied.lead":
      "Other software already lives here. Pupitre won't touch it, but it will stay.",
    "onboarding.verdict.incompatible.title": "Incompatible server",
    "onboarding.verdict.incompatible.lead":
      "Pupitre cannot install on this machine as it stands.",
    "onboarding.verdict.updateAvailable":
      "A newer version of the agent is available.",
    "onboarding.verdict.upToDate": "The agent is up to date.",
    "onboarding.verdict.reasonsLabel": "What the probe saw",
    "onboarding.verdict.fixesLabel": "What lifts these reservations",

    "onboarding.step.agent": "Agent",
    "onboarding.step.catalog": "Catalogue",
    "onboarding.step.config": "Configuration",
    "onboarding.step.done": "Ready",
    "onboarding.step.harden": "Hardening",
    "onboarding.step.install": "Installation",
    "onboarding.step.inspection": "Inspection",
    "onboarding.step.project": "Project",
    "onboarding.step.server": "Server",

    "onboarding.replay.notice":
      "{name} carried a secret. The app didn't keep it: it left on the secret stream at install time, then was forgotten. Enter it again, or have one generated, before replaying the module.",

    "onboarding.server.inspectNamed": "Inspect {name}",
    "onboarding.server.inspect": "Inspect the server",
    "onboarding.server.description":
      "An address, an account, and a key the app generates for this computer. Paste the key on the server before continuing.",
    "onboarding.server.eyebrow": "Server",
    "onboarding.server.title": "The machine to install",

    "onboarding.config.replaySubmit": "Replay this module",
  },
  fr: {
    "onboarding.thisServer": "Ce serveur",
    "onboarding.finish": "Terminer",

    "onboarding.accountGate.title": "Installer un serveur",
    "onboarding.accountGate.eyebrow": "Compte",
    "onboarding.accountGate.description":
      "L'agent est téléchargé depuis la plateforme, signé, puis poussé sur le serveur. Cette app ne l'embarque plus.",

    "onboarding.agent.eyebrow": "Agent",
    "onboarding.agent.description":
      "Le catalogue des services est celui de l'agent : il part sur le serveur avant qu'on lui demande quoi que ce soit.",
    "onboarding.agent.readCatalog": "Lire le catalogue",
    "onboarding.agent.readingTitle": "Lecture du compte",
    "onboarding.agent.readingDetail":
      "Le droit d'usage de cet appareil est vérifié avant tout envoi.",
    "onboarding.agent.inPlace": "Agent en place",
    "onboarding.agent.sendingTitle": "Enrôlement et envoi de l'agent",
    "onboarding.agent.sendingDetail":
      "Le serveur est enrôlé, puis le binaire signé part sur le canal SSH déjà ouvert et s'installe dans /usr/local/bin.",
    "onboarding.agent.sendingNote":
      "La somme de contrôle de ce que le serveur a reçu est comparée à celle de l'app avant la suite.",

    "onboarding.done.eyebrow": "Prêt",
    "onboarding.done.description":
      "Le serveur est installé, et l'app le pilote par son agent.",
    "onboarding.done.connectedAs": "Connecté en",
    "onboarding.done.rootClosed":
      "Root est fermé : plus personne n'entre sur cette machine avec ce compte.",
    "onboarding.done.rootOpen":
      "Root est resté ouvert : reprends le durcissement quand la raison donnée par l'agent aura disparu.",

    "onboarding.enrollment.title": "Serveur enrôlé",
    "onboarding.enrollment.detail":
      "Il apparaît dans la console avec son heartbeat dès que l'agent parle à la plateforme.",

    "onboarding.entry.unfinished":
      "L'installation de {name} n'est pas terminée.",
    "onboarding.entry.noAgent": "Aucun agent Pupitre connu sur {name}.",
    "onboarding.entry.detail":
      "L'assistant inspecte la machine, y pose l'agent, installe les services choisis, puis ferme root.",
    "onboarding.entry.resume": "Reprendre l'installation",
    "onboarding.entry.install": "Installer Pupitre",

    "onboarding.flow.back": "Revenir",
    "onboarding.flow.quit": "Quitter l'assistant",

    "onboarding.harden.eyebrow": "Durcissement",
    "onboarding.harden.description":
      "L'agent ouvre le compte dev, vérifie qu'une clé y entre, puis ferme root. L'app suit avec sa propre configuration SSH.",
    "onboarding.harden.runningTitle": "Durcissement en cours",
    "onboarding.harden.runningDetail":
      "Compte dev, clés recopiées, connexion vérifiée, mots de passe et root fermés.",
    "onboarding.harden.runningNote":
      "Root ne sera fermé que si une clé ouvre dev : sinon l'agent s'arrête et le dit.",
    "onboarding.harden.switchingTitle": "Bascule de la connexion",
    "onboarding.harden.switchingDetail":
      "L'app réécrit sa configuration SSH en User {user} et rouvre le canal.",
    "onboarding.harden.rootClosedTitle": "Root est fermé sur ce serveur.",
    "onboarding.harden.connectedPrefix":
      "L'app s'y connecte maintenant avec le compte",
    "onboarding.harden.connectedSuffix": ", par sa propre configuration SSH.",
    "onboarding.harden.noReason":
      "L'agent n'a pas fermé root, sans en donner la raison.",
    "onboarding.harden.rootOpenPrefix":
      "Root reste ouvert et rien n'a été changé sur la machine : le compte",
    "onboarding.harden.rootOpenSuffix":
      "est celui que l'app continue d'utiliser.",
    "onboarding.harden.continueOpen": "Continuer sans fermer root",

    "onboarding.inspection.eyebrow": "Inspection",
    "onboarding.inspection.pickAnother": "Choisir un autre serveur",
    "onboarding.inspection.install": "Installer",
    "onboarding.inspection.update": "Mettre à jour",
    "onboarding.inspection.continue": "Continuer",
    "onboarding.inspection.installAnyway": "Installer quand même",
    "onboarding.inspection.rerun": "Relancer",
    "onboarding.inspection.waitingDescription":
      "Ce que la machine est, avant d'y toucher.",
    "onboarding.inspection.waitingTitle": "Inspection en cours",
    "onboarding.inspection.waitingDetail":
      "Distribution, architecture, mémoire, disque, ports écoutés, comptes existants, agent déjà installé.",
    "onboarding.inspection.waitingNote":
      "La sonde est lue depuis l'entrée standard : rien n'est écrit sur le serveur.",

    "onboarding.summary.distribution": "Distribution",
    "onboarding.summary.architecture": "Architecture",
    "onboarding.summary.memory": "Mémoire",
    "onboarding.summary.diskFree": "Disque libre",

    "onboarding.verdict.bare.title": "Machine nue",
    "onboarding.verdict.bare.lead":
      "Rien n'est installé sur ce serveur : Pupitre peut le prendre en main.",
    "onboarding.verdict.managed.title": "Déjà géré par Pupitre",
    "onboarding.verdict.managed.lead": "L'agent répond sur ce serveur.",
    "onboarding.verdict.occupied.title": "Serveur occupé",
    "onboarding.verdict.occupied.lead":
      "D'autres logiciels vivent déjà ici. Pupitre n'y touchera pas, mais ils resteront.",
    "onboarding.verdict.incompatible.title": "Serveur incompatible",
    "onboarding.verdict.incompatible.lead":
      "Pupitre ne peut pas s'installer sur cette machine en l'état.",
    "onboarding.verdict.updateAvailable":
      "Une version plus récente de l'agent est disponible.",
    "onboarding.verdict.upToDate": "L'agent est à jour.",
    "onboarding.verdict.reasonsLabel": "Ce que la sonde a vu",
    "onboarding.verdict.fixesLabel": "Ce qui lève ces réserves",

    "onboarding.step.agent": "Agent",
    "onboarding.step.catalog": "Catalogue",
    "onboarding.step.config": "Configuration",
    "onboarding.step.done": "Prêt",
    "onboarding.step.harden": "Durcissement",
    "onboarding.step.install": "Installation",
    "onboarding.step.inspection": "Inspection",
    "onboarding.step.project": "Projet",
    "onboarding.step.server": "Serveur",

    "onboarding.replay.notice":
      "{name} portait un secret. L'app ne l'a pas gardé : il est parti sur le flux secret au moment de l'installation, puis oublié. Saisis-le à nouveau, ou fais-en générer un, avant de rejouer le module.",

    "onboarding.server.inspectNamed": "Inspecter {name}",
    "onboarding.server.inspect": "Inspecter le serveur",
    "onboarding.server.description":
      "Une adresse, un compte, et une clé que l'app génère pour cet ordinateur. Colle la clé sur le serveur avant de continuer.",
    "onboarding.server.eyebrow": "Serveur",
    "onboarding.server.title": "La machine à installer",

    "onboarding.config.replaySubmit": "Rejouer ce module",
  },
} as const;
