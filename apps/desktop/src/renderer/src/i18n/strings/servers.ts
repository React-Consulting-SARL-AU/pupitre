export const servers = {
  en: {
    "servers.addServer": "Add a server",
    "servers.field.address": "Address",
    "servers.field.host": "Host",
    "servers.field.port": "Port",
    "servers.field.user": "Account",
    "servers.row.edit": "Change the address of {name}",
    "servers.edit.save": "Save",
    "servers.edit.note":
      "The connections to this server are reopened on the new address.",
    "servers.edit.done": "The server's address was changed.",
    "servers.edit.hostKeyDropped":
      "The address changed, so the pinned host key was dropped.",
    "servers.edit.hostKeyDroppedFix":
      "The next connection pins the key the server presents there.",
    "servers.field.publicKey": "Public key",

    "servers.hostKey.title": "Connection refused to {name}",
    "servers.hostKey.expected": "Expected fingerprint",
    "servers.hostKey.observed": "Presented fingerprint",
    "servers.hostKey.observedMissing": "none: the pinned fingerprint is gone",
    "servers.hostKey.reinstalled": "I reinstalled this server",

    "servers.mode.generate.title": "Generate a key",
    "servers.mode.generate.detail":
      "An ed25519 key of its own for this computer, in the app's folder.",
    "servers.mode.import.title": "Import a key",
    "servers.mode.import.detail":
      "A key you already have, copied into the app's folder.",
    "servers.mode.system.title": "Use a system host",
    "servers.mode.system.detail":
      "A host already described in your ~/.ssh/config. The app then writes nothing at all.",

    "servers.add.name.label": "Name",
    "servers.add.name.placeholder": "Development server",
    "servers.add.systemHost.label": "System host",
    "servers.add.hostsRead.one": "{count} host read from ~/.ssh/config",
    "servers.add.hostsRead.other": "{count} hosts read from ~/.ssh/config",
    "servers.add.noHosts": "No host in ~/.ssh/config",
    "servers.add.address.help": "An IP address or a hostname",
    "servers.add.port.help": "22 on an ordinary SSH server",
    "servers.add.port.problem": "A port is a whole number from 1 to {max}.",
    "servers.add.port.label": "Port",
    "servers.add.user.help":
      "root at first contact, dev once the machine is hardened",
    "servers.add.user.label": "User",
    "servers.add.user.placeholder": "root",
    "servers.add.keyFile.label": "Private key file",
    "servers.add.pickFile": "Choose a file…",
    "servers.add.noFile": "no file chosen",
    "servers.add.preparing": "Preparing…",
    "servers.add.test": "Test the connection",
    "servers.add.retest": "Test again",
    "servers.add.reached": "{software} answered in {ms} ms.",
    "servers.add.access.opens":
      "A key on this computer already opens the account: nothing to type.",
    "servers.add.access.password": "The account asks for its password.",
    "servers.add.access.manualHelp":
      "The server can still be added: the app will then hand you the key and the line to paste.",
    "servers.add.password.label": "Password of the remote account",
    "servers.add.password.help":
      "Used for this one connection, held nowhere, and never written to a file or a log.",
    "servers.add.installing": "Installing the key…",
    "servers.add.submitWithPassword": "Add and install the key",
    "servers.add.submitAnyway": "Add anyway",
    "servers.add.submit": "Add",
    "servers.add.recommended": "Recommended",

    "servers.key.installing.title": "Installing the key",
    "servers.key.installing.detail":
      "The app is putting the public half on {name}.",
    "servers.key.phase.reaching": "Knocking with the key",
    "servers.key.phase.authorizing": "Writing it into authorized_keys",
    "servers.key.phase.verifying": "Signing in with it alone",

    "servers.key.installed.title": "{name} opens with its key",
    "servers.key.alreadyOpen.title": "{name} already opens",

    "servers.key.password.title": "{name} asks for its password",
    "servers.key.password.intro":
      "No key on this computer opens {user}@{host}. Its password lets the app install one, once.",
    "servers.key.password.label": "Password of the remote account",
    "servers.key.password.help":
      "Used for this one connection, held nowhere, and never written to a file or a log.",
    "servers.key.password.refused":
      "The server refused that password. It is the one for the account above, the one your host gave you.",
    "servers.key.password.submit": "Install the key",
    "servers.key.password.skip": "Do it myself",

    "servers.key.title": "{name} is ready to receive its key",
    "servers.key.intro":
      "The app could not install the public key by itself. Here it is, with the line that installs it.",
    "servers.key.publicHelp":
      "To add to the server's ~/.ssh/authorized_keys if you prefer to do it by hand.",
    "servers.key.commandHelp":
      "To paste in a terminal on this computer. `ssh-copy-id` signs in with the server's password: if the machine only takes keys, install the public key above yourself, then carry on.",
    "servers.key.commandLabel": "Command to paste",
    "servers.key.done": "Done",
    "servers.key.inspect": "Inspect this server",

    "servers.row.activate": "Drive {name}",
    "servers.row.rename": "Name of {name}",
    "servers.row.hidePublicKey": "Hide the public key",
    "servers.row.showPublicKey": "Show the public key",
    "servers.row.remove": "Delete {name}",
    "servers.row.configLabel": "Configuration",
    "servers.row.configApp": "written by the app",
    "servers.row.configGranted": "granted by your organization",
    "servers.row.configSystem": "your ~/.ssh/config",
    "servers.row.hostKeyLabel": "Host key",
    "servers.row.notPinned": "not pinned yet",
    "servers.row.confirmQuestion": "Delete {name}?",
    "servers.row.confirmApp":
      "The key the app made for this server leaves with it, and no other copy of it exists.",
    "servers.row.confirmGrantedOrForget":
      "Removed from here, it stays granted: the list of granted servers puts it back. Deleted everywhere, it leaves the console too, and nothing brings it back.",
    "servers.row.confirmSystem":
      "Your ~/.ssh/config is not touched: only this shortcut disappears.",
    "servers.row.confirmRemove": "Delete permanently",
    "servers.row.confirmRemoveGranted": "Remove from this computer",
    "servers.row.confirmForget": "Delete everywhere",

    "servers.panel.heading": "Your servers",
    "servers.panel.emptyTitle": "No server yet",
  },
  fr: {
    "servers.addServer": "Ajouter un serveur",
    "servers.field.address": "Adresse",
    "servers.field.host": "Hôte",
    "servers.field.port": "Port",
    "servers.field.user": "Compte",
    "servers.row.edit": "Modifier l'adresse de {name}",
    "servers.edit.save": "Enregistrer",
    "servers.edit.note":
      "Les connexions à ce serveur se rouvrent sur la nouvelle adresse.",
    "servers.edit.done": "L'adresse du serveur a été changée.",
    "servers.edit.hostKeyDropped":
      "L'adresse a changé, la clé d'hôte épinglée a donc été oubliée.",
    "servers.edit.hostKeyDroppedFix":
      "La prochaine connexion épingle la clé que le serveur présente là.",
    "servers.field.publicKey": "Clé publique",

    "servers.hostKey.title": "Connexion refusée à {name}",
    "servers.hostKey.expected": "Empreinte attendue",
    "servers.hostKey.observed": "Empreinte présentée",
    "servers.hostKey.observedMissing":
      "aucune : l'empreinte épinglée a disparu",
    "servers.hostKey.reinstalled": "J'ai réinstallé ce serveur",

    "servers.mode.generate.title": "Générer une clé",
    "servers.mode.generate.detail":
      "Une clé ed25519 propre à cet ordinateur, dans le dossier de l'app.",
    "servers.mode.import.title": "Importer une clé",
    "servers.mode.import.detail":
      "Une clé que vous avez déjà, recopiée dans le dossier de l'app.",
    "servers.mode.system.title": "Utiliser un hôte du système",
    "servers.mode.system.detail":
      "Un hôte déjà décrit dans votre ~/.ssh/config. L'app n'écrit alors rien du tout.",

    "servers.add.name.label": "Nom",
    "servers.add.name.placeholder": "Serveur de développement",
    "servers.add.systemHost.label": "Hôte du système",
    "servers.add.hostsRead.one": "{count} hôte lu dans ~/.ssh/config",
    "servers.add.hostsRead.other": "{count} hôtes lus dans ~/.ssh/config",
    "servers.add.noHosts": "Aucun hôte dans ~/.ssh/config",
    "servers.add.address.help": "Une adresse IP ou un nom d'hôte",
    "servers.add.port.help": "22 sur un serveur SSH ordinaire",
    "servers.add.port.problem": "Un port est un nombre entier de 1 à {max}.",
    "servers.add.port.label": "Port",
    "servers.add.user.help":
      "root au premier contact, dev une fois la machine durcie",
    "servers.add.user.label": "Utilisateur",
    "servers.add.user.placeholder": "root",
    "servers.add.keyFile.label": "Fichier de la clé privée",
    "servers.add.pickFile": "Choisir un fichier…",
    "servers.add.noFile": "aucun fichier choisi",
    "servers.add.preparing": "Préparation…",
    "servers.add.test": "Tester la connexion",
    "servers.add.retest": "Retester",
    "servers.add.reached": "{software} a répondu en {ms} ms.",
    "servers.add.access.opens":
      "Une clé de cet ordinateur ouvre déjà le compte : rien à taper.",
    "servers.add.access.password": "Le compte demande son mot de passe.",
    "servers.add.access.manualHelp":
      "Le serveur peut quand même être ajouté : l'app vous donnera alors la clé et la ligne à coller.",
    "servers.add.password.label": "Mot de passe du compte distant",
    "servers.add.password.help":
      "Il sert à cette seule connexion, n'est gardé nulle part et n'est jamais écrit dans un fichier ni un journal.",
    "servers.add.installing": "Installation de la clé…",
    "servers.add.submitWithPassword": "Ajouter et installer la clé",
    "servers.add.submitAnyway": "Ajouter quand même",
    "servers.add.submit": "Ajouter",
    "servers.add.recommended": "Recommandé",

    "servers.key.installing.title": "Installation de la clé",
    "servers.key.installing.detail":
      "L'app pose la moitié publique sur {name}.",
    "servers.key.phase.reaching": "On frappe avec la clé",
    "servers.key.phase.authorizing": "On l'écrit dans authorized_keys",
    "servers.key.phase.verifying": "On se connecte avec elle seule",

    "servers.key.installed.title": "{name} s'ouvre avec sa clé",
    "servers.key.alreadyOpen.title": "{name} s'ouvre déjà",

    "servers.key.password.title": "{name} demande son mot de passe",
    "servers.key.password.intro":
      "Aucune clé de cet ordinateur n'ouvre {user}@{host}. Son mot de passe permet à l'app d'en poser une, une fois.",
    "servers.key.password.label": "Mot de passe du compte distant",
    "servers.key.password.help":
      "Utilisé pour cette seule connexion, gardé nulle part, jamais écrit dans un fichier ni dans un journal.",
    "servers.key.password.refused":
      "Le serveur a refusé ce mot de passe. C'est celui du compte ci-dessus, celui que votre hébergeur vous a donné.",
    "servers.key.password.submit": "Installer la clé",
    "servers.key.password.skip": "Le faire moi-même",

    "servers.key.title": "{name} est prêt à recevoir sa clé",
    "servers.key.intro":
      "L'app n'a pas pu poser la clé publique elle-même. La voici, avec la ligne qui l'installe.",
    "servers.key.publicHelp":
      "À ajouter dans ~/.ssh/authorized_keys du serveur si vous préférez le faire à la main.",
    "servers.key.commandHelp":
      "À coller dans un terminal de cet ordinateur. `ssh-copy-id` se connecte avec le mot de passe du serveur : si la machine n'accepte que des clés, posez vous-même la clé publique ci-dessus, puis continuez.",
    "servers.key.commandLabel": "Commande à coller",
    "servers.key.done": "Terminé",
    "servers.key.inspect": "Inspecter ce serveur",

    "servers.row.activate": "Piloter {name}",
    "servers.row.rename": "Nom de {name}",
    "servers.row.hidePublicKey": "Masquer la clé publique",
    "servers.row.showPublicKey": "Voir la clé publique",
    "servers.row.remove": "Supprimer {name}",
    "servers.row.configLabel": "Configuration",
    "servers.row.configApp": "écrite par l'app",
    "servers.row.configGranted": "attribuée par votre organisation",
    "servers.row.configSystem": "votre ~/.ssh/config",
    "servers.row.hostKeyLabel": "Clé d'hôte",
    "servers.row.notPinned": "pas encore épinglée",
    "servers.row.confirmQuestion": "Supprimer {name} ?",
    "servers.row.confirmApp":
      "La clé que l'app a créée pour ce serveur part avec lui, et il n'en existe pas d'autre copie.",
    "servers.row.confirmGrantedOrForget":
      "Retiré d'ici, il reste attribué : la liste des serveurs attribués sait le remettre. Supprimé partout, il quitte aussi la console, et rien ne le ramène.",
    "servers.row.confirmSystem":
      "Votre ~/.ssh/config n'est pas touché : seul ce raccourci disparaît.",
    "servers.row.confirmRemove": "Supprimer définitivement",
    "servers.row.confirmRemoveGranted": "Retirer de cet ordinateur",
    "servers.row.confirmForget": "Supprimer partout",

    "servers.panel.heading": "Vos serveurs",
    "servers.panel.emptyTitle": "Aucun serveur pour l'instant",
  },
} as const;
