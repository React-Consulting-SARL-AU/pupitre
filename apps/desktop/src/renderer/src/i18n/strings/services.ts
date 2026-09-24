export const services = {
  en: {
    "services.credential.reveal": "Show",
    "services.credential.copy": "Copy",

    "services.account.title": "Account",

    "services.credentials.title": "Credentials",
    "services.credentials.connectionUrl": "Request the connection URL",
    "services.credentials.connectionLabel": "Connection URL",

    "services.config.unread":
      "The settings of this service cannot be shown: the server's catalogue did not answer.",
    "services.config.heldBack":
      "The settings of this service cannot be shown while the server is held back.",
    "services.config.reread": "Read the catalogue again",
    "services.config.title": "Configuration",
    "services.config.unconfigured":
      "This service was installed without being configured. Answer its questions and apply.",
    "services.config.apply": "Apply",
    "services.config.applying":
      "The server is replaying {name} with these values…",
    "services.config.discard": "Discard the changes",
    "services.backups.elsewhere":
      "Backups are set on the server's Backups page: destination, frequency and content.",
    "services.backups.open": "Open backups",
    "services.config.refused.one": "{count} value is refused",
    "services.config.refused.other": "{count} values are refused",
    "services.config.accountNote":
      "Applying sends the connected account to the server again.",
    "services.config.done": "{name} was reconfigured on this server.",
    "services.config.failed":
      "{name}: the server did not apply everything. The steps say where it stopped.",
    "services.config.secretsDropped":
      "The secrets typed left with the refusal: type them again before applying.",

    "services.database.title": "Database",
    "services.database.shell": "Open a shell",
    "services.database.dump": "Export",
    "services.database.import": "Import the dropped dumps",
    "services.database.empty": "No dump to import in the server folder.",
    "services.database.outcome.dump": "Export written to the server",
    "services.database.outcome.import": "Imported dumps",
    "services.database.shellHint":
      "Open a terminal on the database's own client",
    "services.control.start": "Start",
    "services.control.stop": "Stop",
    "services.control.restart": "Restart",
    "services.control.restartQuestion":
      "Restart {name}? Whoever is connected to it is cut off for a moment.",
    "services.control.restartConfirm": "Restart now",
    "services.control.failedHint":
      "{name} stopped on an error. Start it again; if it falls again, the journal below says why.",

    "services.journal.title": "Journal",
    "services.journal.label": "Journal of {name}",
    "services.journal.follow": "Follow",
    "services.journal.copyAll": "Copy",
    "services.journal.lines.one": "{count} line",
    "services.journal.lines.other": "{count} lines",
    "services.journal.copyAllHint": "Copy the journal of {name}",
    "services.journal.waiting": "Waiting for the first lines of {name}",
    "services.journal.cut":
      "Only the last {count} lines are kept: older ones have been dropped.",

    "services.dumps.title": "Dumps on the server",
    "services.dumps.read": "List the dumps",
    "services.dumps.reread": "List again",
    "services.dumps.none": "No dump in the server folder yet.",
    "services.dumps.feeds": "feeds {database}",
    "services.dumps.restore": "Restore",
    "services.dumps.restoreQuestion":
      "Restore into {database}? What that database holds now is replaced.",
    "services.dumps.restoreConfirm": "Restore",
    "services.dumps.remove": "Delete",
    "services.dumps.removeQuestion":
      "Delete {name} from the server? Nothing brings it back.",
    "services.dumps.removeConfirm": "Delete",

    "services.forward.title": "Tunnel to this port",
    "services.forward.open": "Open a tunnel to {port}",
    "services.forward.empty": "No tunnel open.",
    "services.forward.help": "The server's port {port}, on this machine.",
    "services.forward.moved":
      "The server's port {port}, on this machine. Its usual local port, {from}, was taken by something else.",
    "services.forward.address": "Local address",
    "services.forward.close": "Close this tunnel",

    "services.panel.reload": "Reread",
    "services.panel.back": "All services",
    "services.panel.waitingTitle": "Reading the service",

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

    "services.screen.add": "Add a service",
    "services.screen.title": "Services",
    "services.screen.fallbackName": "This server",
    "services.panel.eyebrow": "Service",
    "services.screen.emptyTitle": "No service",

    "services.add.quit": "Exit adding",
    "services.add.replay": "Replay this module",
    "services.add.submit": "Add",

    "services.tunnel.title": "Tunnel",
    "services.tunnel.absent":
      "No exposure module on this server: projects stay reachable through the app's SSH session.",
    "services.tunnel.sync": "Sync the routes",
    "services.tunnel.noRoutes": "No route: no project has a subdomain yet.",
    "services.routes.title": "Routes",

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

    "services.account.title": "Compte",

    "services.credentials.title": "Identifiants",
    "services.credentials.connectionUrl": "Demander l'URL de connexion",
    "services.credentials.connectionLabel": "URL de connexion",

    "services.config.unread":
      "Les réglages de ce service ne peuvent pas être montrés : le catalogue du serveur n'a pas répondu.",
    "services.config.heldBack":
      "Les réglages de ce service ne peuvent pas être montrés tant que le serveur est retenu.",
    "services.config.reread": "Relire le catalogue",
    "services.config.title": "Configuration",
    "services.config.unconfigured":
      "Ce service a été installé sans être configuré. Répondez à ses questions et appliquez.",
    "services.config.apply": "Appliquer",
    "services.config.applying": "Le serveur relance {name} avec ces valeurs…",
    "services.config.discard": "Annuler les modifications",
    "services.backups.elsewhere":
      "Les sauvegardes se règlent sur la page Sauvegardes du serveur : destination, fréquence et contenu.",
    "services.backups.open": "Ouvrir les sauvegardes",
    "services.config.refused.one": "{count} valeur refusée",
    "services.config.refused.other": "{count} valeurs refusées",
    "services.config.accountNote":
      "Appliquer renvoie le compte connecté au serveur.",
    "services.config.done": "{name} a été reconfiguré sur ce serveur.",
    "services.config.failed":
      "{name} : le serveur n'a pas tout appliqué. Les étapes disent où il s'est arrêté.",
    "services.config.secretsDropped":
      "Les secrets tapés sont partis avec le refus : retapez-les avant d'appliquer.",

    "services.database.title": "Base de données",
    "services.database.shell": "Ouvrir un shell",
    "services.database.dump": "Exporter",
    "services.database.import": "Importer les dumps déposés",
    "services.database.empty":
      "Aucun dump à importer dans le dossier du serveur.",
    "services.database.outcome.dump": "Export écrit sur le serveur",
    "services.database.outcome.import": "Dumps importés",
    "services.database.shellHint":
      "Ouvrir un terminal sur le client de la base",
    "services.control.start": "Démarrer",
    "services.control.stop": "Arrêter",
    "services.control.restart": "Redémarrer",
    "services.control.restartQuestion":
      "Redémarrer {name} ? Ce qui y est connecté est coupé un instant.",
    "services.control.restartConfirm": "Redémarrer maintenant",
    "services.control.failedHint":
      "{name} s'est arrêté sur une erreur. Redémarrez-le ; s'il retombe, les logs ci-dessous disent pourquoi.",

    "services.journal.title": "Logs",
    "services.journal.label": "Logs de {name}",
    "services.journal.follow": "Suivre",
    "services.journal.copyAll": "Copier",
    "services.journal.lines.one": "{count} ligne",
    "services.journal.lines.other": "{count} lignes",
    "services.journal.copyAllHint": "Copier les logs de {name}",
    "services.journal.waiting": "En attente des premières lignes de {name}",
    "services.journal.cut":
      "Seules les {count} dernières lignes sont gardées : les plus anciennes ont été retirées.",

    "services.dumps.title": "Dumps sur le serveur",
    "services.dumps.read": "Lister les dumps",
    "services.dumps.reread": "Relister",
    "services.dumps.none":
      "Aucun dump dans le dossier du serveur pour l'instant.",
    "services.dumps.feeds": "nourrit {database}",
    "services.dumps.restore": "Restaurer",
    "services.dumps.restoreQuestion":
      "Restaurer dans {database} ? Ce que cette base contient est remplacé.",
    "services.dumps.restoreConfirm": "Restaurer",
    "services.dumps.remove": "Supprimer",
    "services.dumps.removeQuestion":
      "Supprimer {name} du serveur ? Rien ne le ramène.",
    "services.dumps.removeConfirm": "Supprimer",

    "services.forward.title": "Tunnel vers ce port",
    "services.forward.open": "Ouvrir un tunnel vers {port}",
    "services.forward.empty": "Aucun tunnel ouvert.",
    "services.forward.help": "Le port {port} du serveur, sur cette machine.",
    "services.forward.moved":
      "Le port {port} du serveur, sur cette machine. Son port local habituel, {from}, était pris par autre chose.",
    "services.forward.address": "Adresse locale",
    "services.forward.close": "Fermer ce tunnel",

    "services.panel.reload": "Relire",
    "services.panel.back": "Tous les services",
    "services.panel.waitingTitle": "Lecture du service",

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

    "services.screen.add": "Ajouter un service",
    "services.screen.title": "Services",
    "services.screen.fallbackName": "Ce serveur",
    "services.panel.eyebrow": "Service",
    "services.screen.emptyTitle": "Aucun service",

    "services.add.quit": "Quitter l'ajout",
    "services.add.replay": "Relancer ce module",
    "services.add.submit": "Ajouter",

    "services.tunnel.title": "Tunnel",
    "services.tunnel.absent":
      "Aucun module d'exposition sur ce serveur : les projets restent joignables par la session SSH de l'app.",
    "services.tunnel.sync": "Synchroniser les routes",
    "services.tunnel.noRoutes":
      "Aucune route : aucun projet n'a encore de sous-domaine.",
    "services.routes.title": "Routes",

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
