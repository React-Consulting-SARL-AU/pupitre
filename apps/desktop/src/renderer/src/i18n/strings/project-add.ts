export const projectAdd = {
  en: {
    "projectAdd.form.sourceLabel": "Source",
    "projectAdd.form.sourceHelp":
      "The address of a git repository, or the path of a folder already on the server.",
    "projectAdd.form.sourcePlaceholder": "https://github.com/me/my-site.git",
    "projectAdd.form.sourceReading":
      "The agent clones the repository and reads what it asks for…",
    "projectAdd.form.sourceReadingBranch":
      "The agent clones the {branch} branch and reads what it asks for…",
    "projectAdd.form.sourceReadingDir":
      "The agent reads the folder and what it asks for…",
    "projectAdd.form.sourceRead":
      "Read from the source: {pkgmgr}, port {port}.",
    "projectAdd.form.sourceReadNoPort": "Read from the source: {pkgmgr}.",
    "projectAdd.form.sourceReadProcesses": "Read from the source: {processes}.",
    "projectAdd.form.nameLabel": "Name",
    "projectAdd.form.nameHelp": "Inferred from the source.",
    "projectAdd.form.folderHelp": "Folder: {dir}",
    "projectAdd.form.namePlaceholder": "my-site",
    "projectAdd.form.pkgmgrLabel": "Package manager",
    "projectAdd.form.processesDetected":
      "Read from the server: it already declares this project, and these are its processes.",
    "projectAdd.form.portLabel": "Port",
    "projectAdd.processes.title": "Processes",
    "projectAdd.processes.help":
      "What runs in the project: one process at the least, each from its own folder with its own command. The first one is the main one.",
    "projectAdd.processes.idLabel": "Process",
    "projectAdd.processes.idHelp": "Names the window and the journal.",
    "projectAdd.processes.idPlaceholder": "server",
    "projectAdd.processes.dirLabel": "Folder",
    "projectAdd.processes.dirHelp":
      "Relative to the project; empty for its root.",
    "projectAdd.processes.dirPlaceholder": "client",
    "projectAdd.processes.id":
      "Lower case, digits and dashes, starting and ending on a letter or a digit.",
    "projectAdd.processes.idTaken":
      "Another process of this project carries this id.",
    "projectAdd.processes.dir":
      "A folder inside the project: no leading slash, no “..”.",
    "projectAdd.processes.cmd": "A start command is needed.",
    "projectAdd.processes.remove": "Remove the process {id}",
    "projectAdd.processes.add": "Add a process",
    "projectAdd.ports.title": "Ports",
    "projectAdd.ports.help.local":
      "The first port is the main one: it decides whether the process is online. No exposure is installed on this server, so nothing publishes them.",
    "projectAdd.ports.help.published":
      "The first port is the main one: it decides whether the process is online. A published port gets a name on the web, completed with the server's domain.",
    "projectAdd.ports.labelLabel": "Label",
    "projectAdd.ports.labelPlaceholder": "web",
    "projectAdd.ports.webColumn": "On the web",
    "projectAdd.ports.local": "Not published",
    "projectAdd.ports.label":
      "Lower case, digits and dashes, starting and ending on a letter or a digit.",
    "projectAdd.ports.labelTaken":
      "Another port of this process carries this label.",
    "projectAdd.ports.port": "A port between 1024 and 65535.",
    "projectAdd.ports.portTaken":
      "This port is held by another project of the server, another process, or another row.",
    "projectAdd.ports.publish": "Publish",
    "projectAdd.ports.remove": "Remove the port {label}",
    "projectAdd.ports.add": "Add a port",
    "projectAdd.ports.caddyDns":
      "Caddy serves these names on this server: point each one at {host} in your DNS, with an A record, before it answers.",
    "projectAdd.form.cmdLabel": "Start command",
    "projectAdd.form.cmdHelp":
      "Run from the project's folder, in the agent's session.",
    "projectAdd.form.cmdPlaceholder": "bun run dev --port 3000",
    "projectAdd.form.submit": "Create the project",

    "projectAdd.source.github.title": "GitHub",
    "projectAdd.source.github.detail":
      "The repositories of the account connected in the settings.",
    "projectAdd.source.git.title": "Git address",
    "projectAdd.source.git.detail":
      "Any repository, on GitHub or anywhere else.",
    "projectAdd.source.dir.title": "Folder on the server",
    "projectAdd.source.dir.detail":
      "Sources already on the machine, or a folder to create there.",

    "projectAdd.github.loading": "Reading your repositories",
    "projectAdd.github.filterLabel": "Repository",
    "projectAdd.github.filterPlaceholder.one":
      "Search the account's only repository",
    "projectAdd.github.filterPlaceholder.other": "Search {count} repositories",
    "projectAdd.github.change": "Change repository",
    "projectAdd.github.listLabel": "Repositories of the account",
    "projectAdd.github.refresh": "Read again",
    "projectAdd.github.private": "Private repository",
    "projectAdd.github.empty": "No repository under that name",
    "projectAdd.github.emptyDetail":
      "Try fewer letters, or read the list again.",
    "projectAdd.github.absent": "No GitHub account is connected.",
    "projectAdd.github.absentFix": "Connect one in Settings, Connections.",
    "projectAdd.github.connect": "Open the settings",
    "projectAdd.github.module":
      "This repository is private, and this server cannot open it yet.",
    "projectAdd.github.moduleFix":
      "Install the GitHub service on this server: it puts the identity and the key that clone a private repository.",
    "projectAdd.github.install": "Install the service",

    "projectAdd.folders.root": "Projects",
    "projectAdd.folders.listLabel": "Folders of this level",
    "projectAdd.folders.loading": "Reading the folders of the server",
    "projectAdd.folders.empty": "No folder here",
    "projectAdd.folders.enter": "Open {folder}",

    "projectAdd.form.branchLabel": "Branch",
    "projectAdd.form.branchHelp":
      "Left empty, the repository's own default branch is taken.",
    "projectAdd.form.branchPlaceholder": "main",
    "projectAdd.form.subdomainGenerate": "Propose a free subdomain",
    "projectAdd.form.subdomainDeep":
      "More than one level: a Cloudflare tunnel only serves it if your zone carries an Advanced Certificate Manager — the universal certificate stops at the first level.",
    "projectAdd.form.subdomain.invalid":
      "Lower case, digits and dashes, starting and ending on a letter or a digit; dots separate the levels.",
    "projectAdd.form.subdomain.taken":
      "Another port, on this server, already answers to this name.",

    "projectAdd.panel.title": "New project",
    "projectAdd.panel.cancel": "Cancel",
    "projectAdd.panel.open": "Open the project",
    "projectAdd.panel.loadingTitle": "Reading the projects already declared",

    "projectAdd.phase.add.title": "Project declaration",
    "projectAdd.phase.sources.title": "Fetching the sources",
    "projectAdd.phase.install.title": "Installing the dependencies",
    "projectAdd.phase.up.title": "Start",
    "projectAdd.phase.publish.title": "Name on the web",
    "projectAdd.phase.logs.title": "Address and journal",
    "projectAdd.phaseStatus.pending": "pending",
    "projectAdd.phaseStatus.running": "running",
    "projectAdd.phaseStatus.ok": "done",
    "projectAdd.phaseStatus.skip": "not applicable",
    "projectAdd.phaseStatus.fail": "failed",

    "projectAdd.sources.alreadyPresent": "the folder is already on the server",
    "projectAdd.install.nothing": "the project declares no install command",
    "projectAdd.publish.local": "the project stays local",
    "projectAdd.up.notRunningFix":
      "Read the journal below, fix the start command, then try again.",
    "projectAdd.up.notRunningMessage":
      "{name} is not running: the agent reports it as {state}.",

    "projectAdd.journal.title": "Project journal",
    "projectAdd.journal.lines": "{count} lines",
    "projectAdd.outcome.unknownAddress": "unknown address",
    "projectAdd.outcome.open": "Open",
  },
  fr: {
    "projectAdd.form.sourceLabel": "Source",
    "projectAdd.form.sourceHelp":
      "L'adresse d'un dépôt git, ou le chemin d'un dossier déjà présent sur le serveur.",
    "projectAdd.form.sourcePlaceholder": "https://github.com/moi/mon-site.git",
    "projectAdd.form.sourceReading":
      "L'agent clone le dépôt et lit ce qu'il demande…",
    "projectAdd.form.sourceReadingBranch":
      "L'agent clone la branche {branch} et lit ce qu'elle demande…",
    "projectAdd.form.sourceReadingDir":
      "L'agent lit le dossier et ce qu'il demande…",
    "projectAdd.form.sourceRead": "Lu dans la source : {pkgmgr}, port {port}.",
    "projectAdd.form.sourceReadNoPort": "Lu dans la source : {pkgmgr}.",
    "projectAdd.form.sourceReadProcesses": "Lu dans la source : {processes}.",
    "projectAdd.form.nameLabel": "Nom",
    "projectAdd.form.nameHelp": "Déduit de la source.",
    "projectAdd.form.folderHelp": "Dossier : {dir}",
    "projectAdd.form.namePlaceholder": "mon-site",
    "projectAdd.form.pkgmgrLabel": "Gestionnaire de paquets",
    "projectAdd.form.processesDetected":
      "Lu sur le serveur : il déclare déjà ce projet, et voici ses processus.",
    "projectAdd.form.portLabel": "Port",
    "projectAdd.processes.title": "Processus",
    "projectAdd.processes.help":
      "Ce qui tourne dans le projet : un processus au moins, chacun depuis son dossier avec sa commande. Le premier est le principal.",
    "projectAdd.processes.idLabel": "Processus",
    "projectAdd.processes.idHelp": "Nomme la fenêtre et le journal.",
    "projectAdd.processes.idPlaceholder": "server",
    "projectAdd.processes.dirLabel": "Dossier",
    "projectAdd.processes.dirHelp": "Relatif au projet ; vide pour sa racine.",
    "projectAdd.processes.dirPlaceholder": "client",
    "projectAdd.processes.id":
      "Minuscules, chiffres et tirets, en commençant et en finissant par une lettre ou un chiffre.",
    "projectAdd.processes.idTaken":
      "Un autre processus de ce projet porte cet identifiant.",
    "projectAdd.processes.dir":
      "Un dossier dans le projet : pas de barre oblique en tête, pas de « .. ».",
    "projectAdd.processes.cmd": "Il faut une commande de démarrage.",
    "projectAdd.processes.remove": "Retirer le processus {id}",
    "projectAdd.processes.add": "Ajouter un processus",
    "projectAdd.ports.title": "Ports",
    "projectAdd.ports.help.local":
      "Le premier port est le principal : c'est lui qui dit si le processus est en ligne. Aucune exposition n'est installée sur ce serveur, rien ne les publie.",
    "projectAdd.ports.help.published":
      "Le premier port est le principal : c'est lui qui dit si le processus est en ligne. Un port publié reçoit un nom sur le web, complété du domaine du serveur.",
    "projectAdd.ports.labelLabel": "Libellé",
    "projectAdd.ports.labelPlaceholder": "web",
    "projectAdd.ports.webColumn": "Sur le web",
    "projectAdd.ports.local": "Non publié",
    "projectAdd.ports.label":
      "Minuscules, chiffres et tirets, en commençant et en finissant par une lettre ou un chiffre.",
    "projectAdd.ports.labelTaken":
      "Un autre port de ce processus porte ce libellé.",
    "projectAdd.ports.port": "Un port entre 1024 et 65535.",
    "projectAdd.ports.portTaken":
      "Ce port est tenu par un autre projet du serveur, un autre processus, ou une autre ligne.",
    "projectAdd.ports.publish": "Publier",
    "projectAdd.ports.remove": "Retirer le port {label}",
    "projectAdd.ports.add": "Ajouter un port",
    "projectAdd.ports.caddyDns":
      "Caddy sert ces noms sur ce serveur : faites pointer chacun vers {host} dans votre DNS, par un enregistrement A, avant qu'il réponde.",
    "projectAdd.form.cmdLabel": "Commande de démarrage",
    "projectAdd.form.cmdHelp":
      "Lancée depuis le dossier du projet, dans la session de l'agent.",
    "projectAdd.form.cmdPlaceholder": "bun run dev --port 3000",
    "projectAdd.form.submit": "Créer le projet",

    "projectAdd.source.github.title": "GitHub",
    "projectAdd.source.github.detail":
      "Les dépôts du compte connecté dans les réglages.",
    "projectAdd.source.git.title": "Adresse git",
    "projectAdd.source.git.detail":
      "N'importe quel dépôt, sur GitHub ou ailleurs.",
    "projectAdd.source.dir.title": "Dossier sur le serveur",
    "projectAdd.source.dir.detail":
      "Des sources déjà sur la machine, ou un dossier à y créer.",

    "projectAdd.github.loading": "Lecture de vos dépôts",
    "projectAdd.github.filterLabel": "Dépôt",
    "projectAdd.github.filterPlaceholder.one":
      "Chercher le seul dépôt du compte",
    "projectAdd.github.filterPlaceholder.other":
      "Chercher parmi {count} dépôts",
    "projectAdd.github.change": "Changer de dépôt",
    "projectAdd.github.listLabel": "Dépôts du compte",
    "projectAdd.github.refresh": "Relire",
    "projectAdd.github.private": "Dépôt privé",
    "projectAdd.github.empty": "Aucun dépôt sous ce nom",
    "projectAdd.github.emptyDetail":
      "Essayez moins de lettres, ou relisez la liste.",
    "projectAdd.github.absent": "Aucun compte GitHub n'est connecté.",
    "projectAdd.github.absentFix": "Connectez-en un dans Réglages, Connexions.",
    "projectAdd.github.connect": "Ouvrir les réglages",
    "projectAdd.github.module":
      "Ce dépôt est privé, et ce serveur ne sait pas encore l'ouvrir.",
    "projectAdd.github.moduleFix":
      "Installez le service GitHub sur ce serveur : c'est lui qui pose l'identité et la clé qui clonent un dépôt privé.",
    "projectAdd.github.install": "Installer le service",

    "projectAdd.folders.root": "Projets",
    "projectAdd.folders.listLabel": "Dossiers de ce niveau",
    "projectAdd.folders.loading": "Lecture des dossiers du serveur",
    "projectAdd.folders.empty": "Aucun dossier ici",
    "projectAdd.folders.enter": "Ouvrir {folder}",

    "projectAdd.form.branchLabel": "Branche",
    "projectAdd.form.branchHelp":
      "Laissée vide, c'est la branche par défaut du dépôt qui est prise.",
    "projectAdd.form.branchPlaceholder": "main",
    "projectAdd.form.subdomainGenerate": "Proposer un sous-domaine libre",
    "projectAdd.form.subdomainDeep":
      "Plusieurs niveaux : un tunnel Cloudflare ne les sert que si votre zone porte un Advanced Certificate Manager — le certificat universel s'arrête au premier niveau.",
    "projectAdd.form.subdomain.invalid":
      "Minuscules, chiffres et tirets, en commençant et en finissant par une lettre ou un chiffre ; les points séparent les niveaux.",
    "projectAdd.form.subdomain.taken":
      "Un autre port, sur ce serveur, répond déjà à ce nom.",

    "projectAdd.panel.title": "Nouveau projet",
    "projectAdd.panel.cancel": "Annuler",
    "projectAdd.panel.open": "Ouvrir le projet",
    "projectAdd.panel.loadingTitle": "Lecture des projets déjà déclarés",

    "projectAdd.phase.add.title": "Déclaration du projet",
    "projectAdd.phase.sources.title": "Récupération des sources",
    "projectAdd.phase.install.title": "Installation des dépendances",
    "projectAdd.phase.up.title": "Démarrage",
    "projectAdd.phase.publish.title": "Nom sur le web",
    "projectAdd.phase.logs.title": "Adresse et journal",
    "projectAdd.phaseStatus.pending": "en attente",
    "projectAdd.phaseStatus.running": "en cours",
    "projectAdd.phaseStatus.ok": "faite",
    "projectAdd.phaseStatus.skip": "sans objet",
    "projectAdd.phaseStatus.fail": "en échec",

    "projectAdd.sources.alreadyPresent": "le dossier est déjà sur le serveur",
    "projectAdd.install.nothing":
      "le projet ne déclare aucune commande d'installation",
    "projectAdd.publish.local": "le projet reste local",
    "projectAdd.up.notRunningFix":
      "Lisez le journal ci-dessous, corrigez la commande de démarrage, puis réessayez.",
    "projectAdd.up.notRunningMessage":
      "{name} ne tourne pas : l'agent le donne {state}.",

    "projectAdd.journal.title": "Journal du projet",
    "projectAdd.journal.lines": "{count} lignes",
    "projectAdd.outcome.unknownAddress": "adresse inconnue",
    "projectAdd.outcome.open": "Ouvrir",
  },
} as const;
