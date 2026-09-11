export const connections = {
  en: {
    "connections.state.on": "connected",
    "connections.state.off": "not connected",
    "connections.connected": "Connected as {account}.",
    "connections.held": "Token in place.",
    "connections.unsealed":
      "This computer has no system keychain: the token is held for this session only.",
    "connections.forget": "Disconnect",
    "connections.forgetConfirm": "Disconnect",
    "connections.forgetQuestion.unknown":
      "The token leaves this computer; every server that needs this account cannot install its services until another is connected.",
    "connections.forgetQuestion.unused":
      "The token leaves this computer. No installed service of {server} uses it today.",
    "connections.forgetQuestion.used":
      "The token leaves this computer. On {server}, {modules} use it: their next install or update will be refused until another is connected.",
    "connections.verify": "Check",
    "connections.health.checking": "asking the provider…",
    "connections.health.unaskable":
      "This provider answers no call from here: the server says at install whether the token opens anything.",
    "connections.health.answered": "answers as {account} — checked {when}",
    "connections.save": "Connect",
    "connections.required":
      "This service needs a connected account. Connect it here, then answer its questions below.",

    "connections.cloudflare.title": "Cloudflare account",
    "connections.cloudflare.intro":
      "To put your projects on the internet, Pupitre goes through your own Cloudflare account.",
    "connections.cloudflare.tokenLabel": "API token",
    "connections.cloudflare.tokenHelp": "Kept in this computer's keychain.",
    "connections.cloudflare.tokenHint":
      "Create a token on the Cloudflare dashboard with two permissions: Account · Cloudflare Tunnel · Edit, and Zone · DNS · Edit on the zone your projects publish under.",

    "connections.github.title": "GitHub account",
    "connections.github.intro":
      "The gh command, HTTPS clones without a key, and the server's public key registered on your account.",
    "connections.github.tokenLabel": "Access token",
    "connections.github.tokenHelp": "Kept in this computer's keychain.",
    "connections.github.tokenHint":
      "A token with the repo, read:org and admin:public_key rights, so the server can clone over HTTPS and register its own key.",

    "connections.1password.title": "1Password account",
    "connections.1password.intro":
      "The op command and a service account, to produce a project's .env.local from the template its repository versions.",
    "connections.1password.tokenLabel": "Service account token",
    "connections.1password.tokenHelp":
      "Kept in this computer's keychain. The server says at install whether it opens a vault.",
    "connections.1password.tokenHint":
      "A service account token, not your main password. Create it in Developer › Service Accounts, and grant it only the vault that holds your projects' secrets.",

    "connections.neon.title": "Neon account",
    "connections.neon.intro":
      "The Neon CLI on the server, and the key it takes through NEON_API_KEY.",
    "connections.neon.tokenLabel": "API key",
    "connections.neon.tokenHelp": "Kept in this computer's keychain.",
    "connections.neon.tokenHint":
      "A personal or organisation API key, created in the Neon account settings.",

    "connections.zone.label": "Zone",
    "connections.zone.help": "The zone of your account the domain belongs to.",
    "connections.zone.none": "This account carries no zone.",
    "connections.zone.pick": "Choose a zone",
  },
  fr: {
    "connections.state.on": "connecté",
    "connections.state.off": "non connecté",
    "connections.connected": "Connecté en tant que {account}.",
    "connections.held": "Jeton en place.",
    "connections.unsealed":
      "Cet ordinateur n'a pas de trousseau système : le jeton n'est gardé que pour cette session.",
    "connections.forget": "Déconnecter",
    "connections.forgetConfirm": "Déconnecter",
    "connections.forgetQuestion.unknown":
      "Le jeton quitte cet ordinateur ; chaque serveur qui a besoin de ce compte ne peut plus installer ses services tant qu'un autre n'est pas connecté.",
    "connections.forgetQuestion.unused":
      "Le jeton quitte cet ordinateur. Aucun service installé sur {server} ne l'utilise aujourd'hui.",
    "connections.forgetQuestion.used":
      "Le jeton quitte cet ordinateur. Sur {server}, {modules} l'utilisent : leur prochaine installation ou mise à jour sera refusée tant qu'un autre n'est pas connecté.",
    "connections.verify": "Vérifier",
    "connections.health.checking": "interrogation du fournisseur…",
    "connections.health.unaskable":
      "Ce fournisseur ne répond à aucun appel d'ici : le serveur dit à l'installation si le jeton ouvre quelque chose.",
    "connections.health.answered": "répond comme {account} — vérifié {when}",
    "connections.save": "Connecter",
    "connections.required":
      "Ce service a besoin d'un compte connecté. Connectez-le ici, puis répondez à ses questions ci-dessous.",

    "connections.cloudflare.title": "Compte Cloudflare",
    "connections.cloudflare.intro":
      "Pour rendre vos projets accessibles sur internet, Pupitre passe par votre propre compte Cloudflare.",
    "connections.cloudflare.tokenLabel": "Jeton d'API",
    "connections.cloudflare.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur.",
    "connections.cloudflare.tokenHint":
      "Créez un jeton sur le tableau de bord Cloudflare avec deux permissions : Account · Cloudflare Tunnel · Edit, et Zone · DNS · Edit sur la zone sous laquelle vos projets publient.",

    "connections.github.title": "Compte GitHub",
    "connections.github.intro":
      "La commande gh, le clone HTTPS sans clé, et la clé publique du serveur enregistrée sur votre compte.",
    "connections.github.tokenLabel": "Jeton d'accès",
    "connections.github.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur.",
    "connections.github.tokenHint":
      "Un jeton avec les droits repo, read:org et admin:public_key, pour que le serveur clone en HTTPS et enregistre sa propre clé.",

    "connections.1password.title": "Compte 1Password",
    "connections.1password.intro":
      "La commande op et un compte de service, pour produire le .env.local d'un projet depuis le gabarit que son dépôt versionne.",
    "connections.1password.tokenLabel": "Jeton du compte de service",
    "connections.1password.tokenHelp":
      "Gardé dans le trousseau de cet ordinateur. Le serveur dit à l'installation s'il ouvre un coffre.",
    "connections.1password.tokenHint":
      "Un jeton de compte de service, pas votre mot de passe principal. Créez-le dans Développeur › Comptes de service, et n'autorisez que le coffre qui porte les secrets de vos projets.",

    "connections.neon.title": "Compte Neon",
    "connections.neon.intro":
      "Le CLI Neon sur le serveur, et la clé qu'il prend par NEON_API_KEY.",
    "connections.neon.tokenLabel": "Clé d'API",
    "connections.neon.tokenHelp": "Gardée dans le trousseau de cet ordinateur.",
    "connections.neon.tokenHint":
      "Une clé d'API personnelle ou d'organisation, créée dans les réglages du compte Neon.",

    "connections.zone.label": "Zone",
    "connections.zone.help":
      "La zone de votre compte à laquelle le domaine appartient.",
    "connections.zone.none": "Ce compte ne porte aucune zone.",
    "connections.zone.pick": "Choisir une zone",
  },
} as const;
