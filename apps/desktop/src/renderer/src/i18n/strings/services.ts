export const services = {
  en: {
    "services.credential.reveal": "Show",
    "services.credential.copy": "Copy",

    "services.credentials.title": "Credentials",
    "services.credentials.connectionUrl": "Request the connection URL",
    "services.credentials.connectionLabel": "Connection URL",
    "services.credentials.empty": "This module declares no credentials.",
    "services.credentials.note":
      "The values stay in the main process: they are neither stored nor logged, and the clipboard is written on that side.",

    "services.config.title": "Configuration",
    "services.config.apply": "Apply",
    "services.config.note":
      "These are the values the agent kept from the last installation. Applying replays the module with them; a secret left empty stays the one the server holds.",
    "services.config.done": "{name} was reconfigured on this server.",
    "services.config.failed":
      "{name}: the server did not apply everything. The steps say where it stopped.",

    "services.database.title": "Database",
    "services.database.shell": "Open a shell",
    "services.database.dump": "Export",
    "services.database.import": "Import the dropped dumps",
    "services.database.terminal": "Open a terminal on the server",
    "services.database.empty": "No dump to import in the server folder.",
    "services.database.outcome.dump": "Export written to the server",
    "services.database.outcome.import": "Imported dumps",
    "services.database.outcome.shell": "Command to run on the server",

    "services.forward.title": "Tunnel to this port",
    "services.forward.open": "Open a tunnel to {port}",
    "services.forward.empty":
      "No tunnel open. Once open, the server's port {port} answers on this machine.",
    "services.forward.help": "The server's port {port}, on this machine.",
    "services.forward.address": "Local address",
    "services.forward.close": "Close this tunnel",

    "services.panel.reload": "Reread",
    "services.panel.back": "All services",
    "services.panel.waitingTitle": "Reading the service",
    "services.panel.waitingDetail":
      "State, version, port, systemd unit and the module's credentials.",

    "services.removal.button": "Remove this module",
    "services.removal.losses.intro": "Removing {name} from this server loses:",
    "services.removal.losses.note":
      "Nothing is backed up along the way: export what matters first.",
    "services.removal.losses.confirm": "Remove for good",
    "services.removal.outcome.partial":
      "{names}: the server could not remove everything.",
    "services.removal.outcome.done":
      "{name} has been removed from this server.",
    "services.removal.outcome.back": "Back to services",

    "services.screen.add": "Add a module",
    "services.screen.description":
      "What the agent installed on this machine, and what it says about it.",
    "services.screen.eyebrow": "Services",
    "services.screen.fallbackName": "This server",
    "services.screen.emptyDetail":
      "The agent has installed no module on this machine.",
    "services.screen.emptyTitle": "No service",

    "services.add.quit": "Exit adding",
    "services.add.replay": "Replay this module",
    "services.add.submit": "Add",

    "services.tunnel.title": "Tunnel",
    "services.tunnel.absent":
      "No exposure module on this server: projects stay reachable through the app's SSH session.",
    "services.tunnel.sync": "Sync the routes",
    "services.tunnel.restart": "Restart",
    "services.tunnel.noRoutes": "No route: no project has a subdomain yet.",
    "services.tunnel.state.absent": "absent",
    "services.tunnel.state.failed": "failed",
    "services.tunnel.state.running": "running",
    "services.tunnel.state.stopped": "stopped",

    "services.removal.category.ai":
      "The agent and its configuration on this machine.",
    "services.removal.category.database":
      "The databases of this engine, their accounts and their passwords.",
    "services.removal.category.editor":
      "The preinstalled remote backend: the next connection will download it again.",
    "services.removal.category.exposure":
      "The tunnel and the routes of the projects exposed by this module.",
    "services.removal.category.runtime":
      "The versions laid down by this runtime; the projects that use them will no longer start.",
    "services.removal.category.tool":
      "The tool and the account registered for it.",
    "services.removal.base":
      "{name} and what this module laid down on the machine.",
    "services.removal.secrets":
      "The secrets sent at installation: the app no longer has them and cannot give them back.",
    "services.removal.dependents":
      "{names} depend on it and will stop working.",
    "services.removal.mandatory":
      "This server's catalogue declares this module mandatory.",
  },
  fr: {
    "services.credential.reveal": "Montrer",
    "services.credential.copy": "Copier",

    "services.credentials.title": "Identifiants",
    "services.credentials.connectionUrl": "Demander l'URL de connexion",
    "services.credentials.connectionLabel": "URL de connexion",
    "services.credentials.empty": "Ce module ne déclare aucun identifiant.",
    "services.credentials.note":
      "Les valeurs restent dans le processus principal : elles ne sont ni enregistrées, ni journalisées, et le presse-papiers est écrit de ce côté-là.",

    "services.config.title": "Configuration",
    "services.config.apply": "Appliquer",
    "services.config.note":
      "Ce sont les valeurs que l'agent a gardées de la dernière installation. Appliquer rejoue le module avec elles ; un secret laissé vide reste celui que le serveur détient.",
    "services.config.done": "{name} a été reconfiguré sur ce serveur.",
    "services.config.failed":
      "{name} : le serveur n'a pas tout appliqué. Les étapes disent où il s'est arrêté.",

    "services.database.title": "Base de données",
    "services.database.shell": "Ouvrir un shell",
    "services.database.dump": "Exporter",
    "services.database.import": "Importer les dumps déposés",
    "services.database.terminal": "Ouvrir un terminal sur le serveur",
    "services.database.empty":
      "Aucun dump à importer dans le dossier du serveur.",
    "services.database.outcome.dump": "Export écrit sur le serveur",
    "services.database.outcome.import": "Dumps importés",
    "services.database.outcome.shell": "Commande à lancer sur le serveur",

    "services.forward.title": "Tunnel vers ce port",
    "services.forward.open": "Ouvrir un tunnel vers {port}",
    "services.forward.empty":
      "Aucun tunnel ouvert. Une fois ouvert, le port {port} du serveur répond sur cette machine.",
    "services.forward.help": "Le port {port} du serveur, sur cette machine.",
    "services.forward.address": "Adresse locale",
    "services.forward.close": "Fermer ce tunnel",

    "services.panel.reload": "Relire",
    "services.panel.back": "Tous les services",
    "services.panel.waitingTitle": "Lecture du service",
    "services.panel.waitingDetail":
      "État, version, port, unité systemd et identifiants du module.",

    "services.removal.button": "Retirer ce module",
    "services.removal.losses.intro":
      "Retirer {name} de ce serveur fait perdre :",
    "services.removal.losses.note":
      "Rien n'est sauvegardé au passage : exportez ce qui compte avant.",
    "services.removal.losses.confirm": "Retirer définitivement",
    "services.removal.outcome.partial":
      "{names} : le serveur n'a pas pu tout retirer.",
    "services.removal.outcome.done": "{name} a été retiré de ce serveur.",
    "services.removal.outcome.back": "Revenir aux services",

    "services.screen.add": "Ajouter un module",
    "services.screen.description":
      "Ce que l'agent a installé sur cette machine, et ce qu'il en dit.",
    "services.screen.eyebrow": "Services",
    "services.screen.fallbackName": "Ce serveur",
    "services.screen.emptyDetail":
      "L'agent n'a installé aucun module sur cette machine.",
    "services.screen.emptyTitle": "Aucun service",

    "services.add.quit": "Quitter l'ajout",
    "services.add.replay": "Rejouer ce module",
    "services.add.submit": "Ajouter",

    "services.tunnel.title": "Tunnel",
    "services.tunnel.absent":
      "Aucun module d'exposition sur ce serveur : les projets restent joignables par la session SSH de l'app.",
    "services.tunnel.sync": "Synchroniser les routes",
    "services.tunnel.restart": "Redémarrer",
    "services.tunnel.noRoutes":
      "Aucune route : aucun projet n'a encore de sous-domaine.",
    "services.tunnel.state.absent": "absent",
    "services.tunnel.state.failed": "en échec",
    "services.tunnel.state.running": "actif",
    "services.tunnel.state.stopped": "arrêté",

    "services.removal.category.ai":
      "L'agent et sa configuration sur cette machine.",
    "services.removal.category.database":
      "Les bases de données de ce moteur, leurs comptes et leurs mots de passe.",
    "services.removal.category.editor":
      "Le backend distant préinstallé : la prochaine connexion le retéléchargera.",
    "services.removal.category.exposure":
      "Le tunnel et les routes des projets exposés par ce module.",
    "services.removal.category.runtime":
      "Les versions posées par ce runtime ; les projets qui s'en servent ne démarreront plus.",
    "services.removal.category.tool":
      "L'outil et le compte enregistré pour lui.",
    "services.removal.base":
      "{name} et ce que ce module a posé sur la machine.",
    "services.removal.secrets":
      "Les secrets envoyés à l'installation : l'app ne les a plus et ne pourra pas les rendre.",
    "services.removal.dependents":
      "{names} en dépendent et cesseront de fonctionner.",
    "services.removal.mandatory":
      "Le catalogue de ce serveur déclare ce module obligatoire.",
  },
} as const;
