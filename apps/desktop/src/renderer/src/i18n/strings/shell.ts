export const shell = {
  en: {
    "shell.sidebar.activity": "Processes and sessions",
    "shell.sidebar.closeTerminal": "Close {title}",
    "shell.sidebar.dashboard": "Dashboard",
    "shell.sidebar.gallery": "Gallery",
    "shell.sidebar.newTerminal": "Open a terminal on the server",
    "shell.sidebar.noProjects": "No project declared.",
    "shell.sidebar.noServer": "No server",
    "shell.sidebar.projects": "Projects",
    "shell.sidebar.secrets": "Secrets",
    "shell.sidebar.server": "Server",
    "shell.sidebar.services": "Services",
    "shell.sidebar.settings": "Settings",
    "shell.sidebar.terminals": "Terminals",
    "shell.restricted.console": "Open the console",
    "shell.restricted.repair": "Re-enrol this server",
    "shell.restricted.repairTitle":
      "Ask the console for a fresh enrolment token and hand it to the agent. Nothing running on the server is stopped.",
    "shell.restricted.message":
      "This server no longer holds a valid usage right: it can be read, and refuses everything else. Nothing that was running on it has been stopped.",
    "shell.restricted.fix":
      "Settle this server's subscription in the console, then try the action again.",
    "shell.firstRun.eyebrow": "First server",
    "shell.firstRun.title": "Take a machine in hand",
    "shell.firstRun.body":
      "Pupitre drives a server you own. Give it an address and an account; it does the rest, and says what it is doing at every step.",
    "shell.firstRun.step.inspect.title": "It inspects the machine",
    "shell.firstRun.step.inspect.detail":
      "Distribution, memory, disk, listening ports, existing accounts. Nothing is written on the server: the probe only reads.",
    "shell.firstRun.step.install.title": "It installs what you choose",
    "shell.firstRun.step.install.detail":
      "Databases, runtimes, editors, AI agents. Each service is a module of the catalogue, installed by the agent, replayable if it fails.",
    "shell.firstRun.step.harden.title": "It closes the door behind it",
    "shell.firstRun.step.harden.detail":
      "A dev account, a firewall, then root and passwords closed — but only once a key has been proven to open the machine.",
    "shell.firstRun.addServer": "Add a server",
    "shell.firstRun.settings": "Open the settings",
    "shell.firstRun.note":
      "The private key stays on this computer. The server only ever receives a signed binary and its configuration files.",
    "shell.unready.eyebrow": "Connection",
    "shell.unready.installAgent": "Install the agent",
    "shell.unready.manageServers": "Manage servers",
    "shell.unready.notRespondingBody":
      "The agent did not answer on this machine. If it isn't there yet, the installation puts it in place; otherwise, here is what the connection returned.",
    "shell.unready.notRespondingTitle": "{name} isn't responding yet",
  },
  fr: {
    "shell.sidebar.activity": "Processus et sessions",
    "shell.sidebar.closeTerminal": "Fermer {title}",
    "shell.sidebar.dashboard": "Tableau de bord",
    "shell.sidebar.gallery": "Galerie",
    "shell.sidebar.newTerminal": "Ouvrir un terminal sur le serveur",
    "shell.sidebar.noProjects": "Aucun projet déclaré.",
    "shell.sidebar.noServer": "Aucun serveur",
    "shell.sidebar.projects": "Projets",
    "shell.sidebar.secrets": "Secrets",
    "shell.sidebar.server": "Serveur",
    "shell.sidebar.services": "Services",
    "shell.sidebar.settings": "Réglages",
    "shell.sidebar.terminals": "Terminaux",
    "shell.restricted.console": "Ouvrir la console",
    "shell.restricted.repair": "Ré-enrôler ce serveur",
    "shell.restricted.repairTitle":
      "Demande un jeton d'enrôlement neuf à la console et le remet à l'agent. Rien de ce qui tourne sur le serveur ne s'arrête.",
    "shell.restricted.message":
      "Ce serveur n'a plus de droit d'usage valide : il se laisse lire, et refuse tout le reste. Rien de ce qui tournait dessus ne s'est arrêté.",
    "shell.restricted.fix":
      "Régularisez l'abonnement de ce serveur dans la console, puis relancez l'action.",
    "shell.firstRun.eyebrow": "Premier serveur",
    "shell.firstRun.title": "Prenez une machine en main",
    "shell.firstRun.body":
      "Pupitre pilote un serveur qui est à vous. Donnez-lui une adresse et un compte ; il fait le reste, et dit ce qu'il fait à chaque étape.",
    "shell.firstRun.step.inspect.title": "Il inspecte la machine",
    "shell.firstRun.step.inspect.detail":
      "Distribution, mémoire, disque, ports écoutés, comptes existants. Rien n'est écrit sur le serveur : la sonde ne fait que lire.",
    "shell.firstRun.step.install.title": "Il installe ce que vous choisissez",
    "shell.firstRun.step.install.detail":
      "Bases de données, runtimes, éditeurs, agents IA. Chaque service est un module du catalogue, installé par l'agent, rejouable s'il échoue.",
    "shell.firstRun.step.harden.title": "Il referme la porte derrière lui",
    "shell.firstRun.step.harden.detail":
      "Un compte dev, un pare-feu, puis root et les mots de passe fermés — mais seulement une fois qu'une clé a fait la preuve qu'elle ouvre la machine.",
    "shell.firstRun.addServer": "Ajouter un serveur",
    "shell.firstRun.settings": "Ouvrir les réglages",
    "shell.firstRun.note":
      "La clé privée reste sur cet ordinateur. Le serveur ne reçoit jamais qu'un binaire signé et ses fichiers de configuration.",
    "shell.unready.eyebrow": "Connexion",
    "shell.unready.installAgent": "Installer l'agent",
    "shell.unready.manageServers": "Gérer les serveurs",
    "shell.unready.notRespondingBody":
      "L'agent n'a pas répondu sur cette machine. S'il n'y est pas encore, l'installation le pose ; sinon, voici ce que la connexion a renvoyé.",
    "shell.unready.notRespondingTitle": "{name} ne répond pas encore",
  },
} as const;
