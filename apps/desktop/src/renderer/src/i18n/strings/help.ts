export const help = {
  en: {
    "help.eyebrow": "Application",
    "help.title": "Help",
    "help.guide": "Full guide",
    "help.guide.path": "/en/docs/daily/clients/",
    "help.noServer": "No server added by the app yet.",
    "help.project.placeholder": "~/projects/my-project",

    "help.reach.title": "Reach the server by its name",
    "help.reach.unshared":
      "ssh, your editors and your coding agents do not know your servers yet.",
    "help.reach.unshared.fix":
      "One line at the head of ~/.ssh/config gives every server of the app its name in all of them.",
    "help.reach.enable": "Enable in Settings › SSH",
    "help.reach.shared":
      "Your servers answer to their name in ssh, your editors and your coding agents.",
    "help.reach.command": "Command",
    "help.reach.command.detail": "changed from Settings › Servers",
    "help.reach.account": "Account",
    "help.reach.key": "Key",
    "help.reach.key.detail": "in the app's folder, kept only there",

    "help.module.installed": "{module} is installed on {server}.",
    "help.module.missing": "{module} is not installed on {server}.",
    "help.module.missing.fix":
      "Add it from the services screen: the tool is then on the PATH of every shell, the one a remote client opens included.",
    "help.module.open": "Open the services",

    "help.claude.title": "Claude Code",
    "help.claude.app": "From the Claude app",
    "help.claude.app.detail": "Environment menu, then Add SSH connection:",
    "help.claude.field.name": "Name",
    "help.claude.field.host": "SSH Host",
    "help.claude.field.port": "SSH Port",
    "help.claude.field.identity": "Identity File",
    "help.claude.field.identity.detail":
      "optional once the host resolves through ~/.ssh/config",
    "help.claude.terminal": "From a terminal",
    "help.claude.login":
      "First session: claude prints a sign-in URL to approve in your browser. It is your subscription; nothing goes through Pupitre.",

    "help.codex.title": "Codex",
    "help.codex.app": "From the ChatGPT app",
    "help.codex.app.detail":
      "Codex, then a remote project over SSH: it reads the hosts of ~/.ssh/config and offers {ssh}. There is no field for a key — the app's block names it.",
    "help.codex.terminal": "From a terminal",

    "help.terminal.detail": "tmux keeps the session up when the network drops.",

    "help.editors.title": "Your editor",
    "help.editors.vscode": "VS Code, Cursor, Windsurf",
    "help.editors.vscode.value": "Remote-SSH › {ssh}",
    "help.editors.zed": "Zed",
    "help.editors.jetbrains": "JetBrains Gateway",
    "help.editors.jetbrains.value": "host {ssh}, account {user}, port {port}",
    "help.editors.buttons":
      "The « Open in » buttons on a project's page do this for you, with the project's folder.",

    "help.troubles.title": "When it does not open",
    "help.troubles.password": "A password is asked.",
    "help.troubles.password.fix":
      "The key is not in dev's authorized_keys: reveal the public key from the server's entry and compare.",
    "help.troubles.notFound": "command not found from a remote client.",
    "help.troubles.notFound.fix":
      "The client opened a shell that did not read .zshenv. Check with: ssh {ssh} 'which claude'",
    "help.troubles.hostKey": "The host key changed.",
    "help.troubles.hostKey.fix":
      "A reinstalled machine changes its key. The app asks on its side; in your own ~/.ssh/known_hosts, remove the old line.",
  },
  fr: {
    "help.eyebrow": "Application",
    "help.title": "Aide",
    "help.guide": "Guide complet",
    "help.guide.path": "/fr/docs/daily/clients/",
    "help.noServer": "Aucun serveur ajouté par l'app pour l'instant.",
    "help.project.placeholder": "~/projects/mon-projet",

    "help.reach.title": "Joindre le serveur par son nom",
    "help.reach.unshared":
      "ssh, vos éditeurs et vos agents de code ne connaissent pas encore vos serveurs.",
    "help.reach.unshared.fix":
      "Une ligne en tête de ~/.ssh/config donne à chaque serveur de l'app son nom dans tous à la fois.",
    "help.reach.enable": "Activer dans Réglages › SSH",
    "help.reach.shared":
      "Vos serveurs répondent à leur nom dans ssh, vos éditeurs et vos agents de code.",
    "help.reach.command": "Commande",
    "help.reach.command.detail": "modifiable dans Réglages › Serveurs",
    "help.reach.account": "Compte",
    "help.reach.key": "Clé",
    "help.reach.key.detail": "dans le dossier de l'app, gardée là seulement",

    "help.module.installed": "{module} est installé sur {server}.",
    "help.module.missing": "{module} n'est pas installé sur {server}.",
    "help.module.missing.fix":
      "Ajoutez-le depuis l'écran des services : l'outil est alors sur le PATH de tous les shells, celui qu'ouvre un client distant compris.",
    "help.module.open": "Ouvrir les services",

    "help.claude.title": "Claude Code",
    "help.claude.app": "Depuis l'app Claude",
    "help.claude.app.detail": "Menu d'environnement, puis Add SSH connection :",
    "help.claude.field.name": "Name",
    "help.claude.field.host": "SSH Host",
    "help.claude.field.port": "SSH Port",
    "help.claude.field.identity": "Identity File",
    "help.claude.field.identity.detail":
      "facultatif dès que l'hôte se résout par ~/.ssh/config",
    "help.claude.terminal": "Depuis un terminal",
    "help.claude.login":
      "Première session : claude affiche une URL de connexion à approuver dans votre navigateur. C'est votre abonnement, rien ne passe par Pupitre.",

    "help.codex.title": "Codex",
    "help.codex.app": "Depuis l'app ChatGPT",
    "help.codex.app.detail":
      "Codex, puis un projet distant par SSH : elle lit les hôtes de ~/.ssh/config et propose {ssh}. Pas de champ pour une clé — le bloc de l'app la nomme.",
    "help.codex.terminal": "Depuis un terminal",

    "help.terminal.detail":
      "tmux garde la session ouverte quand le réseau tombe.",

    "help.editors.title": "Votre éditeur",
    "help.editors.vscode": "VS Code, Cursor, Windsurf",
    "help.editors.vscode.value": "Remote-SSH › {ssh}",
    "help.editors.zed": "Zed",
    "help.editors.jetbrains": "JetBrains Gateway",
    "help.editors.jetbrains.value": "hôte {ssh}, compte {user}, port {port}",
    "help.editors.buttons":
      "Les boutons « Ouvrir dans » de la fiche d'un projet font ce réglage pour vous, avec le dossier du projet.",

    "help.troubles.title": "Quand ça n'ouvre pas",
    "help.troubles.password": "Un mot de passe est demandé.",
    "help.troubles.password.fix":
      "La clé n'est pas dans l'authorized_keys de dev : révélez la clé publique depuis la fiche du serveur et comparez.",
    "help.troubles.notFound": "command not found depuis un client distant.",
    "help.troubles.notFound.fix":
      "Le client a ouvert un shell qui n'a pas lu .zshenv. Vérifiez avec : ssh {ssh} 'which claude'",
    "help.troubles.hostKey": "La clé d'hôte a changé.",
    "help.troubles.hostKey.fix":
      "Une machine réinstallée change de clé. L'app le demande de son côté ; dans votre ~/.ssh/known_hosts, retirez l'ancienne ligne.",
  },
} as const;
