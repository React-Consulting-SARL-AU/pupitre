export const forwards = {
  en: {
    "forwards.panel": "Local ports",
    "forwards.panel.count.one": "{count} open",
    "forwards.panel.count.other": "{count} open",
    "forwards.panel.toggle": "Show or hide the local ports",
    "forwards.address": "localhost:{port}",
    "forwards.route": "localhost:{local} → :{remote}",
    "forwards.close": "Close the forward of port {port}",
    "forwards.moved":
      "Its usual port, {from}, was taken by something else on this computer.",
    "forwards.keep":
      "Keep port {port} open: it comes back with the app and after a drop",
    "forwards.unkeep": "Stop keeping the forward of port {port} open",
    "forwards.reconnecting": "Connection lost, opening again…",
    "forwards.reach": "Reach port {port} from this computer",
    "forwards.here": "On this computer",
  },
  fr: {
    "forwards.panel": "Ports locaux",
    "forwards.panel.count.one": "{count} ouvert",
    "forwards.panel.count.other": "{count} ouverts",
    "forwards.panel.toggle": "Afficher ou masquer les ports locaux",
    "forwards.address": "localhost:{port}",
    "forwards.route": "localhost:{local} → :{remote}",
    "forwards.close": "Fermer la redirection du port {port}",
    "forwards.moved":
      "Son port habituel, {from}, était pris par autre chose sur cet ordinateur.",
    "forwards.keep":
      "Garder ouvert le port {port} : il revient avec l'app et après une coupure",
    "forwards.unkeep": "Ne plus garder ouverte la redirection du port {port}",
    "forwards.reconnecting": "Connexion perdue, réouverture…",
    "forwards.reach": "Accéder au port {port} depuis cet ordinateur",
    "forwards.here": "Sur cet ordinateur",
  },
} as const;
