export const connections = {
  en: {
    "connections.connected": "Connected as {account}.",
    "connections.held": "Token in place.",
    "connections.unsealed":
      "This computer has no system keychain: the token is held for this session only.",
    "connections.forget": "Disconnect",
    "connections.save": "Connect",
    "connections.required":
      "This service goes through an account you connect once, for every server. Connect it here, then answer its own questions below.",

    "connections.cloudflare.title": "Cloudflare account",
    "connections.cloudflare.intro":
      "To put your projects on the internet, Pupitre goes through your own Cloudflare account.",
    "connections.cloudflare.tokenLabel": "API token",
    "connections.cloudflare.tokenHelp":
      "Asked once, for every server. It is kept in this computer's keychain.",
    "connections.cloudflare.tokenHint":
      "Create a token on the Cloudflare dashboard with two permissions: Account · Cloudflare Tunnel · Edit, and Zone · DNS · Edit on the zone your projects publish under. The app reads which account it opens, so there is no identifier to copy.",

    "connections.github.title": "GitHub account",
    "connections.github.intro":
      "The gh command, HTTPS clones without a key, and the server's public key registered on your account.",
    "connections.github.tokenLabel": "Access token",
    "connections.github.tokenHelp":
      "Asked once, for every server. It is kept in this computer's keychain.",
    "connections.github.tokenHint":
      "A token with the repo, read:org and admin:public_key rights, so the server can clone over HTTPS and register its own key. The app reads which account it opens, so there is no name to copy.",

    "connections.1password.title": "1Password account",
    "connections.1password.intro":
      "The op command and a service account, to produce a project's .env.local from the template its repository versions.",
    "connections.1password.tokenLabel": "Service account token",
    "connections.1password.tokenHelp":
      "Asked once, for every server. It is kept in this computer's keychain, and this app cannot check it: the server says at install whether it opens a vault.",
    "connections.1password.tokenHint":
      "A service account token, not your main password. Create it in Developer › Service Accounts, and grant it only the vault that holds your projects' secrets. The server can read that vault and nothing else.",

    "connections.neon.title": "Neon account",
    "connections.neon.intro":
      "The Neon CLI on the server, and the key it takes through NEON_API_KEY.",
    "connections.neon.tokenLabel": "API key",
    "connections.neon.tokenHelp":
      "Asked once, for every server. It is kept in this computer's keychain.",
    "connections.neon.tokenHint":
      "A personal or organisation API key, created in the Neon account settings. Projects and databases remain your decision, the module creates none.",

    "connections.zone.label": "Zone",
    "connections.zone.help": "The zone of your account the domain belongs to.",
    "connections.zone.none": "This account carries no zone.",
    "connections.zone.pick": "Choose a zone",
  },
  fr: {
    "connections.connected": "Connecté en tant que {account}.",
    "connections.held": "Jeton en place.",
    "connections.unsealed":
      "Cet ordinateur n'a pas de trousseau système : le jeton n'est gardé que pour cette session.",
    "connections.forget": "Déconnecter",
    "connections.save": "Connecter",
    "connections.required":
      "Ce service passe par un compte que vous connectez une fois, pour tous les serveurs. Connectez-le ici, puis répondez à ses propres questions ci-dessous.",

    "connections.cloudflare.title": "Compte Cloudflare",
    "connections.cloudflare.intro":
      "Pour rendre vos projets accessibles sur internet, Pupitre passe par votre propre compte Cloudflare.",
    "connections.cloudflare.tokenLabel": "Jeton d'API",
    "connections.cloudflare.tokenHelp":
      "Demandé une seule fois, pour tous les serveurs. Il est gardé dans le trousseau de cet ordinateur.",
    "connections.cloudflare.tokenHint":
      "Créez un jeton sur le tableau de bord Cloudflare avec deux permissions : Account · Cloudflare Tunnel · Edit, et Zone · DNS · Edit sur la zone sous laquelle vos projets publient. L'app lit elle-même le compte qu'il ouvre : aucun identifiant à recopier.",

    "connections.github.title": "Compte GitHub",
    "connections.github.intro":
      "La commande gh, le clone HTTPS sans clé, et la clé publique du serveur enregistrée sur votre compte.",
    "connections.github.tokenLabel": "Jeton d'accès",
    "connections.github.tokenHelp":
      "Demandé une seule fois, pour tous les serveurs. Il est gardé dans le trousseau de cet ordinateur.",
    "connections.github.tokenHint":
      "Un jeton avec les droits repo, read:org et admin:public_key, pour que le serveur clone en HTTPS et enregistre sa propre clé. L'app lit elle-même le compte qu'il ouvre : aucun nom à recopier.",

    "connections.1password.title": "Compte 1Password",
    "connections.1password.intro":
      "La commande op et un compte de service, pour produire le .env.local d'un projet depuis le gabarit que son dépôt versionne.",
    "connections.1password.tokenLabel": "Jeton du compte de service",
    "connections.1password.tokenHelp":
      "Demandé une seule fois, pour tous les serveurs. Il est gardé dans le trousseau de cet ordinateur, et cette app ne peut pas le vérifier : le serveur dit à l'installation s'il ouvre un coffre.",
    "connections.1password.tokenHint":
      "Un jeton de compte de service, pas votre mot de passe principal. Créez-le dans Développeur › Comptes de service, et n'autorisez que le coffre qui porte les secrets de vos projets. Le serveur ne peut lire que ce coffre-là.",

    "connections.neon.title": "Compte Neon",
    "connections.neon.intro":
      "Le CLI Neon sur le serveur, et la clé qu'il prend par NEON_API_KEY.",
    "connections.neon.tokenLabel": "Clé d'API",
    "connections.neon.tokenHelp":
      "Demandée une seule fois, pour tous les serveurs. Elle est gardée dans le trousseau de cet ordinateur.",
    "connections.neon.tokenHint":
      "Une clé d'API personnelle ou d'organisation, créée dans les réglages du compte Neon. Les projets et les bases restent votre décision, le module n'en crée aucun.",

    "connections.zone.label": "Zone",
    "connections.zone.help":
      "La zone de votre compte à laquelle le domaine appartient.",
    "connections.zone.none": "Ce compte ne porte aucune zone.",
    "connections.zone.pick": "Choisir une zone",
  },
} as const;
