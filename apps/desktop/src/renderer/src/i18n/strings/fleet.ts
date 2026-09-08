export const fleet = {
  en: {
    "fleet.heading": "Granted by your organization",
    "fleet.intro":
      "The address, the account and the key come from the console. There is nothing to type and no key to carry: this computer is already registered as a device.",

    "fleet.reading.title": "Reading your organization's servers",
    "fleet.reading.detail": "Assignments, addresses and key readiness",

    "fleet.empty.title": "No server granted to you",
    "fleet.empty.detail":
      "An administrator of your organization assigns a server to you from the console. It appears here on its own.",

    "fleet.noAddress.one":
      "{count} granted server has no address on the console yet.",
    "fleet.noAddress.other":
      "{count} granted servers have no address on the console yet.",

    "fleet.dismissed.one": "{count} granted server is hidden on this computer.",
    "fleet.dismissed.other":
      "{count} granted servers are hidden on this computer.",
    "fleet.restore": "Put them back",

    "fleet.row.address": "Address",
    "fleet.row.platformState": "Console",
    "fleet.row.open": "Open",
    "fleet.row.reopen": "Drive it",
    "fleet.row.granted": "Granted",
    "fleet.row.pending": "Being prepared",
    "fleet.row.withdrawn": "Withdrawn",
    "fleet.row.withdrawnDetail":
      "The console has suspended this server. It comes back on its own once the subscription does.",

    "fleet.waiting.title": "The console is pushing your key",
    "fleet.waiting.detail":
      "Leave this window open: the server opens on its own once its agent has taken the key.",

    "fleet.organizations.heading": "Your organizations",
    "fleet.organizations.note":
      "The active organization decides the usage right, never which servers you were given. Switching moves this computer alone: the console keeps its own.",
    "fleet.organizations.switch": "Make active",
    "fleet.organizations.active": "Active",
  },
  fr: {
    "fleet.heading": "Attribués par votre organisation",
    "fleet.intro":
      "L'adresse, le compte et la clé viennent de la console. Rien à saisir, aucune clé à porter : cet ordinateur est déjà enregistré comme appareil.",

    "fleet.reading.title": "Lecture des serveurs de votre organisation",
    "fleet.reading.detail": "Attributions, adresses et clés posées",

    "fleet.empty.title": "Aucun serveur ne vous est attribué",
    "fleet.empty.detail":
      "Un administrateur de votre organisation vous attribue un serveur depuis la console. Il paraît ici tout seul.",

    "fleet.noAddress.one":
      "{count} serveur attribué n'a pas encore d'adresse sur la console.",
    "fleet.noAddress.other":
      "{count} serveurs attribués n'ont pas encore d'adresse sur la console.",

    "fleet.dismissed.one":
      "{count} serveur attribué est masqué sur cet ordinateur.",
    "fleet.dismissed.other":
      "{count} serveurs attribués sont masqués sur cet ordinateur.",
    "fleet.restore": "Les remettre",

    "fleet.row.address": "Adresse",
    "fleet.row.platformState": "Console",
    "fleet.row.open": "Ouvrir",
    "fleet.row.reopen": "Le piloter",
    "fleet.row.granted": "Attribué",
    "fleet.row.pending": "En préparation",
    "fleet.row.withdrawn": "Retiré",
    "fleet.row.withdrawnDetail":
      "La console a suspendu ce serveur. Il revient de lui-même dès que l'abonnement revient.",

    "fleet.waiting.title": "La console pose votre clé",
    "fleet.waiting.detail":
      "Laissez cette fenêtre ouverte : le serveur s'ouvre tout seul dès que son agent a pris la clé.",

    "fleet.organizations.heading": "Vos organisations",
    "fleet.organizations.note":
      "L'organisation active décide du droit d'usage, jamais des serveurs qui vous sont attribués. La bascule ne bouge que cet ordinateur : la console garde la sienne.",
    "fleet.organizations.switch": "Rendre active",
    "fleet.organizations.active": "Active",
  },
} as const;
