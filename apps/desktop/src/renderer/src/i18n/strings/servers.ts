export const servers = {
  en: {
    "servers.addServer": "Add a server",
    "servers.field.address": "Address",
    "servers.field.publicKey": "Public key",

    "servers.hostKey.title": "Connection refused to {name}",
    "servers.hostKey.expected": "Expected fingerprint",
    "servers.hostKey.observed": "Presented fingerprint",
    "servers.hostKey.observedMissing": "none: the pinned fingerprint is gone",
    "servers.hostKey.reinstalled": "I reinstalled this server",

    "servers.mode.generate.title": "Generate a key",
    "servers.mode.generate.detail":
      "An ed25519 key of its own for this computer, in the app's folder. Nothing to prepare.",
    "servers.mode.import.title": "Import a key",
    "servers.mode.import.detail":
      "A key you already have. It is copied into the app's folder, never read in place.",
    "servers.mode.system.title": "Use a system host",
    "servers.mode.system.detail":
      "A host already described in your ~/.ssh/config. The app then writes nothing at all.",

    "servers.add.introBefore":
      "The app writes its own SSH configuration and keeps the key in its folder. Your",
    "servers.add.introAfter": "is never modified.",
    "servers.add.name.help": "What the sidebar will show",
    "servers.add.name.label": "Name",
    "servers.add.name.placeholder": "Development server",
    "servers.add.systemHost.label": "System host",
    "servers.add.hostsRead.one": "{count} host read from ~/.ssh/config",
    "servers.add.hostsRead.other": "{count} hosts read from ~/.ssh/config",
    "servers.add.noHosts": "No host in ~/.ssh/config",
    "servers.add.address.help": "An IP address or a hostname",
    "servers.add.port.help": "22 on an ordinary SSH server",
    "servers.add.port.label": "Port",
    "servers.add.user.help":
      "root at first contact, dev once the machine is hardened",
    "servers.add.user.label": "User",
    "servers.add.user.placeholder": "root",
    "servers.add.keyFile.label": "Private key file",
    "servers.add.pickFile": "Choose a file…",
    "servers.add.noFile": "no file chosen",
    "servers.add.preparing": "Preparing…",
    "servers.add.submit": "Add",
    "servers.add.recommended": "Recommended",

    "servers.key.title": "{name} is ready to receive its key",
    "servers.key.intro":
      "The private key stays in the app's folder, at 0600. Carry the public half to the server — the command below does it for you.",
    "servers.key.publicHelp":
      "To add to the server's ~/.ssh/authorized_keys if you prefer to do it by hand.",
    "servers.key.commandHelp":
      "To paste in a terminal on this computer. The password asked for is the server's.",
    "servers.key.commandLabel": "Command to paste",
    "servers.key.done": "Done",

    "servers.row.activate": "Drive {name}",
    "servers.row.rename": "Name of {name}",
    "servers.row.hidePublicKey": "Hide the public key",
    "servers.row.showPublicKey": "Show the public key",
    "servers.row.remove": "Delete {name}",
    "servers.row.configLabel": "Configuration",
    "servers.row.configApp": "written by the app",
    "servers.row.configSystem": "your ~/.ssh/config",
    "servers.row.hostKeyLabel": "Host key",
    "servers.row.notPinned": "not pinned yet",
    "servers.row.confirmQuestion": "Delete {name}?",
    "servers.row.confirmApp":
      "The key the app made for this server leaves with it, and no other copy of it exists.",
    "servers.row.confirmSystem":
      "Your ~/.ssh/config is not touched: only this shortcut disappears.",
    "servers.row.confirmRemove": "Delete permanently",

    "servers.panel.heading": "Your servers",
    "servers.panel.intro":
      "The app keeps an SSH configuration of its own, one key per server in its folder, and each machine's fingerprint from the first contact.",
    "servers.panel.emptyDetail":
      "An address, an account, and a key the app generates for this computer.",
    "servers.panel.emptyTitle": "No server yet",
  },
  fr: {
    "servers.addServer": "Ajouter un serveur",
    "servers.field.address": "Adresse",
    "servers.field.publicKey": "Clé publique",

    "servers.hostKey.title": "Connexion refusée à {name}",
    "servers.hostKey.expected": "Empreinte attendue",
    "servers.hostKey.observed": "Empreinte présentée",
    "servers.hostKey.observedMissing":
      "aucune : l'empreinte épinglée a disparu",
    "servers.hostKey.reinstalled": "J'ai réinstallé ce serveur",

    "servers.mode.generate.title": "Générer une clé",
    "servers.mode.generate.detail":
      "Une clé ed25519 propre à cet ordinateur, dans le dossier de l'app. Rien à préparer.",
    "servers.mode.import.title": "Importer une clé",
    "servers.mode.import.detail":
      "Une clé que vous avez déjà. Elle est recopiée dans le dossier de l'app, jamais lue sur place.",
    "servers.mode.system.title": "Utiliser un hôte du système",
    "servers.mode.system.detail":
      "Un hôte déjà décrit dans votre ~/.ssh/config. L'app n'écrit alors rien du tout.",

    "servers.add.introBefore":
      "L'app écrit sa propre configuration SSH et garde la clé dans son dossier. Votre",
    "servers.add.introAfter": "n'est jamais modifié.",
    "servers.add.name.help": "Ce que la barre latérale affichera",
    "servers.add.name.label": "Nom",
    "servers.add.name.placeholder": "Serveur de développement",
    "servers.add.systemHost.label": "Hôte du système",
    "servers.add.hostsRead.one": "{count} hôte lu dans ~/.ssh/config",
    "servers.add.hostsRead.other": "{count} hôtes lus dans ~/.ssh/config",
    "servers.add.noHosts": "Aucun hôte dans ~/.ssh/config",
    "servers.add.address.help": "Une adresse IP ou un nom d'hôte",
    "servers.add.port.help": "22 sur un serveur SSH ordinaire",
    "servers.add.port.label": "Port",
    "servers.add.user.help":
      "root au premier contact, dev une fois la machine durcie",
    "servers.add.user.label": "Utilisateur",
    "servers.add.user.placeholder": "root",
    "servers.add.keyFile.label": "Fichier de la clé privée",
    "servers.add.pickFile": "Choisir un fichier…",
    "servers.add.noFile": "aucun fichier choisi",
    "servers.add.preparing": "Préparation…",
    "servers.add.submit": "Ajouter",
    "servers.add.recommended": "Recommandé",

    "servers.key.title": "{name} est prêt à recevoir sa clé",
    "servers.key.intro":
      "La clé privée reste dans le dossier de l'app, en 0600. Portez la moitié publique sur le serveur — la commande ci-dessous le fait pour vous.",
    "servers.key.publicHelp":
      "À ajouter dans ~/.ssh/authorized_keys du serveur si vous préférez le faire à la main.",
    "servers.key.commandHelp":
      "À coller dans un terminal de cet ordinateur. Le mot de passe demandé est celui du serveur.",
    "servers.key.commandLabel": "Commande à coller",
    "servers.key.done": "Terminé",

    "servers.row.activate": "Piloter {name}",
    "servers.row.rename": "Nom de {name}",
    "servers.row.hidePublicKey": "Masquer la clé publique",
    "servers.row.showPublicKey": "Voir la clé publique",
    "servers.row.remove": "Supprimer {name}",
    "servers.row.configLabel": "Configuration",
    "servers.row.configApp": "écrite par l'app",
    "servers.row.configSystem": "votre ~/.ssh/config",
    "servers.row.hostKeyLabel": "Clé d'hôte",
    "servers.row.notPinned": "pas encore épinglée",
    "servers.row.confirmQuestion": "Supprimer {name} ?",
    "servers.row.confirmApp":
      "La clé que l'app a créée pour ce serveur part avec lui, et il n'en existe pas d'autre copie.",
    "servers.row.confirmSystem":
      "Votre ~/.ssh/config n'est pas touché : seul ce raccourci disparaît.",
    "servers.row.confirmRemove": "Supprimer définitivement",

    "servers.panel.heading": "Vos serveurs",
    "servers.panel.intro":
      "L'app garde une configuration SSH à elle, une clé par serveur dans son dossier, et l'empreinte de chaque machine dès le premier contact.",
    "servers.panel.emptyDetail":
      "Une adresse, un compte, et une clé que l'app génère pour cet ordinateur.",
    "servers.panel.emptyTitle": "Aucun serveur pour l'instant",
  },
} as const;
