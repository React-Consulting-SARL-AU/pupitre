export const connections = {
  en: {
    "connections.cloudflare.title": "Cloudflare account",
    "connections.cloudflare.intro":
      "To put your projects on the internet, Pupitre goes through your own Cloudflare account.",
    "connections.cloudflare.connected": "Connected as {account}.",
    "connections.cloudflare.unsealed":
      "This computer has no system keychain: the token is held for this session only.",
    "connections.cloudflare.forget": "Disconnect",
    "connections.cloudflare.tokenLabel": "API token",
    "connections.cloudflare.tokenHelp":
      "Asked once, for every server. It is kept in this computer's keychain.",
    "connections.cloudflare.tokenHint":
      "Create a token on the Cloudflare dashboard with two permissions: Account · Cloudflare Tunnel · Edit, and Zone · DNS · Edit on the zone your projects publish under. The app reads which account it opens, so there is no identifier to copy.",
    "connections.cloudflare.save": "Connect",
    "connections.cloudflare.required":
      "This service publishes through your Cloudflare account. Connect it here, then choose the domain below.",
    "connections.zone.label": "Zone",
    "connections.zone.help": "The zone of your account the domain belongs to.",
    "connections.zone.none": "This account carries no zone.",
    "connections.zone.pick": "Choose a zone",
  },
  fr: {
    "connections.cloudflare.title": "Compte Cloudflare",
    "connections.cloudflare.intro":
      "Pour rendre vos projets accessibles sur internet, Pupitre passe par votre propre compte Cloudflare.",
    "connections.cloudflare.connected": "Connecté en tant que {account}.",
    "connections.cloudflare.unsealed":
      "Cet ordinateur n'a pas de trousseau système : le jeton n'est gardé que pour cette session.",
    "connections.cloudflare.forget": "Déconnecter",
    "connections.cloudflare.tokenLabel": "Jeton d'API",
    "connections.cloudflare.tokenHelp":
      "Demandé une seule fois, pour tous les serveurs. Il est gardé dans le trousseau de cet ordinateur.",
    "connections.cloudflare.tokenHint":
      "Créez un jeton sur le tableau de bord Cloudflare avec deux permissions : Account · Cloudflare Tunnel · Edit, et Zone · DNS · Edit sur la zone sous laquelle vos projets publient. L'app lit elle-même le compte qu'il ouvre : aucun identifiant à recopier.",
    "connections.cloudflare.save": "Connecter",
    "connections.cloudflare.required":
      "Ce service publie par votre compte Cloudflare. Connectez-le ici, puis choisissez le domaine ci-dessous.",
    "connections.zone.label": "Zone",
    "connections.zone.help":
      "La zone de votre compte à laquelle le domaine appartient.",
    "connections.zone.none": "Ce compte ne porte aucune zone.",
    "connections.zone.pick": "Choisir une zone",
  },
} as const;
