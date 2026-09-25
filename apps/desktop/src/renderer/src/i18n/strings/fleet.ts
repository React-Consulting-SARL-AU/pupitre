export const fleet = {
  en: {
    "fleet.empty.detail":
      "An administrator of your organization assigns a server to you from the console.",

    "fleet.noAddress.one":
      "{count} granted server has no address on the console yet.",
    "fleet.noAddress.other":
      "{count} granted servers have no address on the console yet.",

    "fleet.dismissed.one": "{count} granted server is hidden on this computer.",
    "fleet.dismissed.other":
      "{count} granted servers are hidden on this computer.",
    "fleet.restore": "Show the hidden servers again",
    "fleet.grants.title": "Servers granted to you",
    "fleet.row.platformState": "Console",
    "fleet.row.organization": "Organization",
    "fleet.row.open": "Open",
    "fleet.row.granted": "Granted",
    "fleet.row.pending": "Being prepared",
    "fleet.row.withdrawn": "Withdrawn",
    "fleet.row.withdrawnDetail":
      "The console has suspended this server. It comes back on its own once the subscription does.",
    "fleet.status.active": "active",
    "fleet.status.enrolling": "enrolling",
    "fleet.status.grace": "grace period",
    "fleet.status.suspended": "suspended",
    "fleet.status.revoked": "revoked",
    "fleet.console.open": "Manage in the console",

    "fleet.waiting.title": "The console is pushing your key",
    "fleet.waiting.detail":
      "Leave this window open: the server opens on its own once its agent has taken the key.",

    "fleet.organizations.heading": "Your organizations",
    "fleet.organizations.switch": "Make active",
    "fleet.organizations.active": "Active",
  },
  fr: {
    "fleet.empty.detail":
      "Un administrateur de votre organisation vous attribue un serveur depuis la console.",

    "fleet.noAddress.one":
      "{count} serveur attribué n'a pas encore d'adresse sur la console.",
    "fleet.noAddress.other":
      "{count} serveurs attribués n'ont pas encore d'adresse sur la console.",

    "fleet.dismissed.one":
      "{count} serveur attribué est masqué sur cet ordinateur.",
    "fleet.dismissed.other":
      "{count} serveurs attribués sont masqués sur cet ordinateur.",
    "fleet.restore": "Réafficher les serveurs masqués",
    "fleet.grants.title": "Serveurs qui vous sont attribués",
    "fleet.row.platformState": "Console",
    "fleet.row.organization": "Organisation",
    "fleet.row.open": "Ouvrir",
    "fleet.row.granted": "Attribué",
    "fleet.row.pending": "En préparation",
    "fleet.row.withdrawn": "Retiré",
    "fleet.row.withdrawnDetail":
      "La console a suspendu ce serveur. Il revient de lui-même dès que l'abonnement revient.",
    "fleet.status.active": "actif",
    "fleet.status.enrolling": "rattachement en cours",
    "fleet.status.grace": "en tolérance",
    "fleet.status.suspended": "suspendu",
    "fleet.status.revoked": "révoqué",
    "fleet.console.open": "Gérer dans la console",

    "fleet.waiting.title": "La console pose votre clé",
    "fleet.waiting.detail":
      "Laissez cette fenêtre ouverte : le serveur s'ouvre tout seul dès que son agent a pris la clé.",

    "fleet.organizations.heading": "Vos organisations",
    "fleet.organizations.switch": "Rendre active",
    "fleet.organizations.active": "Active",
  },
} as const;
