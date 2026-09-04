export const firstProject = {
  en: {
    "firstProject.form.sourceHelp":
      "The address of a git repository, or the path of a folder already on the server.",
    "firstProject.form.sourceLabel": "Source",
    "firstProject.form.sourcePlaceholder": "https://github.com/me/my-site.git",
    "firstProject.form.folderHelp": "Folder: {dir}",
    "firstProject.form.nameHelp": "Inferred from the source.",
    "firstProject.form.nameLabel": "Name",
    "firstProject.form.namePlaceholder": "my-site",
    "firstProject.form.pkgmgrDetected":
      "Detected: the server already declares this project.",
    "firstProject.form.pkgmgrHelp":
      "It also gives the command that installs the dependencies.",
    "firstProject.form.pkgmgrLabel": "Package manager",
    "firstProject.form.portHelp": "Free among the projects the agent declares.",
    "firstProject.form.portLabel": "Port",
    "firstProject.form.subdomainHelp":
      "The installed Cloudflare tunnel publishes the project under this name.",
    "firstProject.form.subdomainLabel": "Subdomain",
    "firstProject.form.cmdHelp":
      "Run from the project's folder, in the agent's session.",
    "firstProject.form.cmdLabel": "Start command",
    "firstProject.form.cmdPlaceholder": "bun run dev --port 3000",
    "firstProject.form.submit": "Create the project",

    "firstProject.journal.title": "Project journal",
    "firstProject.journal.lines": "{count} lines",

    "firstProject.outcome.unknownAddress": "unknown address",
    "firstProject.outcome.open": "Open",

    "firstProject.panel.finish": "Finish",
    "firstProject.panel.later": "Later",
    "firstProject.panel.description":
      "A repository to clone or a folder already there: the agent declares it, installs it, starts it and opens its journal.",
    "firstProject.panel.eyebrow": "First project",
    "firstProject.panel.defaultServer": "This server",
    "firstProject.panel.loadingDetail":
      "Their ports decide which one this project can take.",
    "firstProject.panel.loadingTitle": "Reading the projects already declared",

    "firstProject.phase.add.title": "Project declaration",
    "firstProject.phase.install.title": "Installing the dependencies",
    "firstProject.phase.logs.title": "Address and journal",
    "firstProject.phase.sources.title": "Fetching the sources",
    "firstProject.phase.up.title": "Start",
    "firstProject.phase.add.doing":
      "The agent writes the project's line in its registry.",
    "firstProject.phase.install.doing":
      "The agent installs the dependencies with the chosen manager.",
    "firstProject.phase.logs.doing":
      "The agent gives the project's address and opens its journal.",
    "firstProject.phase.sources.doing":
      "The agent clones the repository and installs the dependencies.",
    "firstProject.phase.up.doing":
      "The agent runs the start command in its session.",
    "firstProject.phaseStatus.fail": "failed",
    "firstProject.phaseStatus.ok": "done",
    "firstProject.phaseStatus.pending": "pending",
    "firstProject.phaseStatus.running": "running",
    "firstProject.phaseStatus.skip": "not applicable",

    "firstProject.sources.alreadyPresent":
      "the folder is already on the server",
    "firstProject.install.doneWithSources": "done with the source fetch",
    "firstProject.up.notRunningFix":
      "Read the journal below, fix the start command, then try again.",
    "firstProject.up.notRunningMessage":
      "{name} is not running: the agent reports it as {state}.",
  },
  fr: {
    "firstProject.form.sourceHelp":
      "L'adresse d'un dépôt git, ou le chemin d'un dossier déjà présent sur le serveur.",
    "firstProject.form.sourceLabel": "Source",
    "firstProject.form.sourcePlaceholder":
      "https://github.com/moi/mon-site.git",
    "firstProject.form.folderHelp": "Dossier : {dir}",
    "firstProject.form.nameHelp": "Déduit de la source.",
    "firstProject.form.nameLabel": "Nom",
    "firstProject.form.namePlaceholder": "mon-site",
    "firstProject.form.pkgmgrDetected":
      "Détecté : le serveur déclare déjà ce projet.",
    "firstProject.form.pkgmgrHelp":
      "Il donne aussi la commande d'installation des dépendances.",
    "firstProject.form.pkgmgrLabel": "Gestionnaire de paquets",
    "firstProject.form.portHelp":
      "Libre d'après les projets que l'agent déclare.",
    "firstProject.form.portLabel": "Port",
    "firstProject.form.subdomainHelp":
      "Le tunnel Cloudflare installé publie le projet sous ce nom.",
    "firstProject.form.subdomainLabel": "Sous-domaine",
    "firstProject.form.cmdHelp":
      "Lancée depuis le dossier du projet, dans la session de l'agent.",
    "firstProject.form.cmdLabel": "Commande de démarrage",
    "firstProject.form.cmdPlaceholder": "bun run dev --port 3000",
    "firstProject.form.submit": "Créer le projet",

    "firstProject.journal.title": "Journal du projet",
    "firstProject.journal.lines": "{count} lignes",

    "firstProject.outcome.unknownAddress": "adresse inconnue",
    "firstProject.outcome.open": "Ouvrir",

    "firstProject.panel.finish": "Terminer",
    "firstProject.panel.later": "Plus tard",
    "firstProject.panel.description":
      "Un dépôt à cloner ou un dossier déjà là : l'agent le déclare, l'installe, le démarre et ouvre son journal.",
    "firstProject.panel.eyebrow": "Premier projet",
    "firstProject.panel.defaultServer": "Ce serveur",
    "firstProject.panel.loadingDetail":
      "Leurs ports décident de celui que ce projet peut prendre.",
    "firstProject.panel.loadingTitle": "Lecture des projets déjà déclarés",

    "firstProject.phase.add.title": "Déclaration du projet",
    "firstProject.phase.install.title": "Installation des dépendances",
    "firstProject.phase.logs.title": "Adresse et journal",
    "firstProject.phase.sources.title": "Récupération des sources",
    "firstProject.phase.up.title": "Démarrage",
    "firstProject.phase.add.doing":
      "L'agent écrit la ligne du projet dans son registre.",
    "firstProject.phase.install.doing":
      "L'agent installe les dépendances avec le gestionnaire choisi.",
    "firstProject.phase.logs.doing":
      "L'agent donne l'adresse du projet et ouvre son journal.",
    "firstProject.phase.sources.doing":
      "L'agent clone le dépôt et installe les dépendances.",
    "firstProject.phase.up.doing":
      "L'agent lance la commande de démarrage dans sa session.",
    "firstProject.phaseStatus.fail": "en échec",
    "firstProject.phaseStatus.ok": "faite",
    "firstProject.phaseStatus.pending": "en attente",
    "firstProject.phaseStatus.running": "en cours",
    "firstProject.phaseStatus.skip": "sans objet",

    "firstProject.sources.alreadyPresent": "le dossier est déjà sur le serveur",
    "firstProject.install.doneWithSources":
      "faite avec la récupération des sources",
    "firstProject.up.notRunningFix":
      "Lis le journal ci-dessous, corrige la commande de démarrage, puis réessaie.",
    "firstProject.up.notRunningMessage":
      "{name} ne tourne pas : l'agent le donne {state}.",
  },
} as const;
