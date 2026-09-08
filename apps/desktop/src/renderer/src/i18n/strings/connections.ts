export const connections = {
  en: {
    "connections.cloudflare.title": "Cloudflare account",
    "connections.cloudflare.intro":
      "The tunnel runs on your own Cloudflare account. The app makes it from this computer and writes the DNS; the server only receives what makes it run.",
    "connections.cloudflare.connected": "Connected as {account}.",
    "connections.cloudflare.unsealed":
      "This computer has no system keychain: the token is held for this session only.",
    "connections.cloudflare.forget": "Disconnect",
    "connections.cloudflare.tokenLabel": "API token",
    "connections.cloudflare.tokenHelp":
      "Given once, for every server. It goes to the system keychain and never comes back.",
    "connections.cloudflare.tokenHint":
      "Create a token on the Cloudflare dashboard with two permissions: Account · Cloudflare Tunnel · Edit, and Zone · DNS · Edit on the zone your projects publish under. The app reads which account it opens, so there is no identifier to copy.",
    "connections.cloudflare.save": "Connect",
    "connections.cloudflare.required":
      "This module publishes through your Cloudflare account. Connect it here, then choose the domain below.",
    "connections.zone.label": "Zone",
    "connections.zone.help": "The zone of your account the domain belongs to.",
    "connections.zone.none": "This account carries no zone.",
    "connections.zone.pick": "Choose a zone",
    "connections.domain.shared":
      "{name} already publishes under this domain: two servers sharing it will collide on a project of the same name.",
  },
  fr: {
    "connections.cloudflare.title": "Compte Cloudflare",
    "connections.cloudflare.intro":
      "Le tunnel tourne sur votre propre compte Cloudflare. L'app le monte depuis cet ordinateur et écrit le DNS ; le serveur ne reçoit que de quoi le faire tourner.",
    "connections.cloudflare.connected": "Connecté en tant que {account}.",
    "connections.cloudflare.unsealed":
      "Cet ordinateur n'a pas de trousseau système : le jeton n'est gardé que pour cette session.",
    "connections.cloudflare.forget": "Déconnecter",
    "connections.cloudflare.tokenLabel": "Jeton d'API",
    "connections.cloudflare.tokenHelp":
      "Donné une fois, pour tous les serveurs. Il part au trousseau système et n'en revient jamais.",
    "connections.cloudflare.tokenHint":
      "Créez un jeton sur le tableau de bord Cloudflare avec deux permissions : Account · Cloudflare Tunnel · Edit, et Zone · DNS · Edit sur la zone sous laquelle vos projets publient. L'app lit elle-même le compte qu'il ouvre : aucun identifiant à recopier.",
    "connections.cloudflare.save": "Connecter",
    "connections.cloudflare.required":
      "Ce module publie par votre compte Cloudflare. Connectez-le ici, puis choisissez le domaine ci-dessous.",
    "connections.zone.label": "Zone",
    "connections.zone.help":
      "La zone de votre compte à laquelle le domaine appartient.",
    "connections.zone.none": "Ce compte ne porte aucune zone.",
    "connections.zone.pick": "Choisir une zone",
    "connections.domain.shared":
      "{name} publie déjà sous ce domaine : deux serveurs qui le partagent se heurteront sur un projet de même nom.",
  },
} as const;
