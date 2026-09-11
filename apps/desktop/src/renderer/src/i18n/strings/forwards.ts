export const forwards = {
  en: {
    "forwards.panel": "Local ports",
    "forwards.panel.count.one": "{count} open",
    "forwards.panel.count.other": "{count} open",
    "forwards.panel.toggle": "Show or hide the local ports",
    "forwards.route": "127.0.0.1:{local} → server :{remote}",
    "forwards.close": "Close the forward of port {port}",
    "forwards.moved":
      "Its usual port, {from}, was taken by something else on this computer.",
  },
  fr: {
    "forwards.panel": "Ports locaux",
    "forwards.panel.count.one": "{count} ouvert",
    "forwards.panel.count.other": "{count} ouverts",
    "forwards.panel.toggle": "Afficher ou masquer les ports locaux",
    "forwards.route": "127.0.0.1:{local} → serveur :{remote}",
    "forwards.close": "Fermer la redirection du port {port}",
    "forwards.moved":
      "Son port habituel, {from}, était pris par autre chose sur cet ordinateur.",
  },
} as const;
