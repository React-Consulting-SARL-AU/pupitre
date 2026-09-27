export const access = {
  en: {
    "access.title": "Access",
    "shell.sidebar.access": "Access",
    "access.keys.title": "Access keys",
    "access.keys.projectTitle": "Keys that open {name}",
    "access.keys.new": "New key",
    "access.keys.none": "No access key yet",
    "access.keys.noneDetail":
      "Every protected address asks for one. This computer draws its own the first time it opens one.",
    "access.keys.reading": "Reading the server's access keys",
    "access.key.device": "This computer",
    "access.key.scope.all": "Whole server",
    "access.key.scope.one": "{name}",
    "access.key.scope.many": "{count} projects",
    "access.key.created": "Created {date}",
    "access.key.copy": "Copy the key {name}",
    "access.key.copyLink": "Link to {hostname}",
    "access.key.copyHeader": "Pupitre-Key header",
    "access.key.copyKey": "Key alone",
    "access.key.copied.link":
      "Link copied: it opens the site already signed in.",
    "access.key.copied.header":
      "Header copied: send it with every request of your client or API tool.",
    "access.key.copied.key": "Key copied.",
    "access.key.elsewhere":
      "Created on another computer: only that one can copy it.",
    "access.key.revoke": "Revoke {name}",
    "access.key.revokeConfirm": "Revoke",
    "access.key.revokeQuestion":
      "Everyone using {name} loses access at their next request, this computer included if it is its key.",
    "access.create.title": "New access key",
    "access.create.name": "Key name",
    "access.create.nameHelp":
      "Who or what uses it: the name reaches the site in the Pupitre-Identity header.",
    "access.create.namePlaceholder": "iPhone simulator, client review…",
    "access.create.scope": "The key opens",
    "access.create.scope.project": "The project {name}",
    "access.create.scope.all":
      "Every project of the server, those added later included",
    "access.create.scope.chosen": "The projects chosen below",
    "access.create.projects": "Projects the key opens",
    "access.create.submit": "Create the key",
    "access.create.cancel": "Cancel",
    "access.create.done": "Key {name} created",
    "access.create.doneDetail":
      "This computer alone keeps it. It never expires: revoke it when nobody should use it any more.",
    "access.create.close": "Done",
    "access.protection.title": "Protection",
    "access.protection.switch": "Protect the project",
    "access.protection.on":
      "Its addresses open only with an access key. Pupitre adds this computer's key to every address it opens.",
    "access.protection.off":
      "Its addresses answer anyone who holds them, unless a process below says otherwise.",
    "access.processes.title": "Processes",
    "access.processes.label": "Access of {id}",
    "access.processes.project.protected": "As the project: protected",
    "access.processes.project.public": "As the project: public",
    "access.processes.protected": "Always protected",
    "access.processes.public": "Always public",
    "access.processes.publicHelp":
      "A public process answers anyone holding its address: keep it for a webhook receiver that checks its own signature.",
    "access.processes.noAddress": "No public address",
    "access.unexposed":
      "No exposure is installed: the addresses of this project do not leave the server.",
    "access.agentTooOld":
      "The agent of this server has no access gate: update it from Services to protect this project.",
    "access.usage.title": "Using a key",
    "access.usage.browser": "In a browser",
    "access.usage.browserDetail":
      "Open the copied link once: the browser keeps the access, the address keeps its path and query.",
    "access.usage.client": "From an app or a script",
    "access.usage.clientDetail":
      "Send the Pupitre-Key header. The site's own Authorization header and cookies are left alone.",
    "access.usage.socket": "WebSocket and EventSource",
    "access.usage.socketDetail":
      "Where a header cannot be set, pass the key in the address, as the pupitre_key parameter.",
    "refusal.access.invalid":
      "An access key needs a name and at least one project.",
    "refusal.access.invalid.fix": "Name it, then choose what it opens.",
    "refusal.access.unreadable":
      "The server created the key without describing it.",
    "refusal.access.unreadable.fix": "Read the list of keys again.",
    "refusal.access.elsewhere":
      "This key was created on another computer, which alone keeps it.",
    "refusal.access.elsewhere.fix":
      "Copy it from that computer, or create another key here.",
    "refusal.access.address":
      "Only a protected address of this server receives a key.",
    "refusal.access.address.fix": "Open the address from the project's page.",
    "refusal.access.device":
      "This computer could not get its access key, so the address opened without one.",
    "refusal.access.device.fix":
      "Open the project's Access tab to see why, then open the address again.",
  },
  fr: {
    "access.title": "Accès",
    "shell.sidebar.access": "Accès",
    "access.keys.title": "Clés d'accès",
    "access.keys.projectTitle": "Clés qui ouvrent {name}",
    "access.keys.new": "Nouvelle clé",
    "access.keys.none": "Aucune clé d'accès",
    "access.keys.noneDetail":
      "Chaque adresse protégée en demande une. Cet ordinateur tire la sienne la première fois qu'il en ouvre une.",
    "access.keys.reading": "Lecture des clés d'accès du serveur",
    "access.key.device": "Cet ordinateur",
    "access.key.scope.all": "Tout le serveur",
    "access.key.scope.one": "{name}",
    "access.key.scope.many": "{count} projets",
    "access.key.created": "Créée le {date}",
    "access.key.copy": "Copier la clé {name}",
    "access.key.copyLink": "Lien vers {hostname}",
    "access.key.copyHeader": "En-tête Pupitre-Key",
    "access.key.copyKey": "Clé seule",
    "access.key.copied.link": "Lien copié : il ouvre le site déjà connecté.",
    "access.key.copied.header":
      "En-tête copié : envoyez-le avec chaque requête de votre client ou outil d'API.",
    "access.key.copied.key": "Clé copiée.",
    "access.key.elsewhere":
      "Créée sur un autre ordinateur : lui seul peut la copier.",
    "access.key.revoke": "Révoquer {name}",
    "access.key.revokeConfirm": "Révoquer",
    "access.key.revokeQuestion":
      "Tous ceux qui utilisent {name} perdent l'accès à leur requête suivante, cet ordinateur compris si c'est sa clé.",
    "access.create.title": "Nouvelle clé d'accès",
    "access.create.name": "Nom de la clé",
    "access.create.nameHelp":
      "Qui ou quoi l'utilise : le nom parvient au site dans l'en-tête Pupitre-Identity.",
    "access.create.namePlaceholder": "Simulateur iPhone, recette client…",
    "access.create.scope": "La clé ouvre",
    "access.create.scope.project": "Le projet {name}",
    "access.create.scope.all":
      "Tous les projets du serveur, y compris ceux ajoutés plus tard",
    "access.create.scope.chosen": "Les projets choisis ci-dessous",
    "access.create.projects": "Projets que la clé ouvre",
    "access.create.submit": "Créer la clé",
    "access.create.cancel": "Annuler",
    "access.create.done": "Clé {name} créée",
    "access.create.doneDetail":
      "Seul cet ordinateur la garde. Elle n'expire jamais : révoquez-la quand plus personne ne doit s'en servir.",
    "access.create.close": "Terminé",
    "access.protection.title": "Protection",
    "access.protection.switch": "Protéger le projet",
    "access.protection.on":
      "Ses adresses ne s'ouvrent qu'avec une clé d'accès. Pupitre ajoute celle de cet ordinateur à chaque adresse qu'il ouvre.",
    "access.protection.off":
      "Ses adresses répondent à quiconque les détient, sauf pour un processus qui en décide autrement ci-dessous.",
    "access.processes.title": "Processus",
    "access.processes.label": "Accès de {id}",
    "access.processes.project.protected": "Comme le projet : protégé",
    "access.processes.project.public": "Comme le projet : public",
    "access.processes.protected": "Toujours protégé",
    "access.processes.public": "Toujours public",
    "access.processes.publicHelp":
      "Un processus public répond à quiconque détient son adresse : réservez-le à un récepteur de webhooks qui vérifie sa propre signature.",
    "access.processes.noAddress": "Aucune adresse publique",
    "access.unexposed":
      "Aucune exposition n'est installée : les adresses de ce projet ne sortent pas du serveur.",
    "access.agentTooOld":
      "L'agent de ce serveur n'a pas de portier d'accès : mettez-le à jour depuis Services pour protéger ce projet.",
    "access.usage.title": "Utiliser une clé",
    "access.usage.browser": "Dans un navigateur",
    "access.usage.browserDetail":
      "Ouvrez une fois le lien copié : le navigateur garde l'accès, l'adresse garde son chemin et ses paramètres.",
    "access.usage.client": "Depuis une app ou un script",
    "access.usage.clientDetail":
      "Envoyez l'en-tête Pupitre-Key. L'en-tête Authorization et les cookies du site restent intacts.",
    "access.usage.socket": "WebSocket et EventSource",
    "access.usage.socketDetail":
      "Là où un en-tête ne se pose pas, passez la clé dans l'adresse, en paramètre pupitre_key.",
    "refusal.access.invalid":
      "Une clé d'accès demande un nom et au moins un projet.",
    "refusal.access.invalid.fix":
      "Nommez-la, puis choisissez ce qu'elle ouvre.",
    "refusal.access.unreadable": "Le serveur a créé la clé sans la décrire.",
    "refusal.access.unreadable.fix": "Relisez la liste des clés.",
    "refusal.access.elsewhere":
      "Cette clé a été créée sur un autre ordinateur, qui seul la garde.",
    "refusal.access.elsewhere.fix":
      "Copiez-la depuis cet ordinateur, ou créez une autre clé ici.",
    "refusal.access.address":
      "Seule une adresse protégée de ce serveur reçoit une clé.",
    "refusal.access.address.fix": "Ouvrez l'adresse depuis la page du projet.",
    "refusal.access.device":
      "Cet ordinateur n'a pas pu obtenir sa clé d'accès : l'adresse s'est ouverte sans elle.",
    "refusal.access.device.fix":
      "Ouvrez l'onglet Accès du projet pour voir pourquoi, puis rouvrez l'adresse.",
  },
} as const;
