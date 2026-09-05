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
    "shell.restricted.message":
      "This server no longer holds a valid usage right: it can be read, and refuses everything else. Nothing that was running on it has been stopped.",
    "shell.restricted.fix":
      "Settle this server's subscription in the console, then try the action again.",
    "shell.unready.addServer": "Add a server",
    "shell.unready.eyebrow": "Connection",
    "shell.unready.installAgent": "Install the agent",
    "shell.unready.manageServers": "Manage servers",
    "shell.unready.noServerBody":
      "The app talks to your server over SSH, with its own configuration and key. Your ~/.ssh/config is never modified.",
    "shell.unready.noServerTitle": "No server yet",
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
    "shell.restricted.message":
      "Ce serveur n'a plus de droit d'usage valide : il se laisse lire, et refuse tout le reste. Rien de ce qui tournait dessus ne s'est arrêté.",
    "shell.restricted.fix":
      "Régularisez l'abonnement de ce serveur dans la console, puis relancez l'action.",
    "shell.unready.addServer": "Ajouter un serveur",
    "shell.unready.eyebrow": "Connexion",
    "shell.unready.installAgent": "Installer l'agent",
    "shell.unready.manageServers": "Gérer les serveurs",
    "shell.unready.noServerBody":
      "L'app parle à votre serveur en SSH, avec une configuration et une clé qui lui sont propres. Votre ~/.ssh/config n'est jamais modifié.",
    "shell.unready.noServerTitle": "Aucun serveur pour l'instant",
    "shell.unready.notRespondingBody":
      "L'agent n'a pas répondu sur cette machine. S'il n'y est pas encore, l'installation le pose ; sinon, voici ce que la connexion a renvoyé.",
    "shell.unready.notRespondingTitle": "{name} ne répond pas encore",
  },
} as const;
