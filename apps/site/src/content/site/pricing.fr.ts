import type { PricingContent } from "./pricing"

export const pricingFr: PricingContent = {
  meta: {
    title: "Tarifs — Pupitre",
    description:
      "{price} HT par serveur et par mois, en Solo comme en Équipe. {months} mois offerts à l’année, {days} jours d’essai sans carte. Quand vous arrêtez, votre serveur continue de tourner.",
  },
  hero: {
    label: "Tarifs",
    headline: "Un prix par serveur. Le serveur reste à vous.",
    lead: "Solo et Équipe coûtent le même prix par serveur : {price} HT par mois. À l’année, {months} mois sont offerts. L’essai dure {days} jours et ne demande pas de carte. Quand vous arrêtez de payer, votre serveur continue de fonctionner sans Pupitre.",
    unit: "par serveur et par mois",
  },
  billing: {
    legend: "Facturation",
    month: "Mensuel",
    year: "Annuel",
    yearNote: "{months} mois offerts",
  },
  plans: {
    label: "Offres",
    title: "Solo, Équipe, et plus tard Hébergé",
    perServerMonth: "par serveur et par mois, HT",
    perServerYear: "par serveur et par an, HT",
    perMonth: "par mois, HT",
    from: "À partir de",
    later: "Plus tard",
    serversUpTo: "Jusqu’à {count} serveurs apportés",
    serversUnlimited: "Autant de serveurs que vous en apportez",
    trial: "{days} jours d’essai, sans carte.",
    sameRate:
      "Le prix par serveur est le même en Solo et en Équipe : une agence achète l’organisation, pas une remise.",
    download: "Télécharger l’app",
    items: {
      solo: {
        audience: "Une personne",
        includes: [
          "L’app desktop, et l’agent sur chaque serveur",
          "Tout le catalogue : runtimes, bases, agents, éditeurs, exposition",
          "Les mises à jour et les alertes",
          "Vos propres abonnements Claude, Codex ou Hermes",
        ],
        cta: "Commander",
      },
      team: {
        audience: "Une organisation",
        includes: [
          "Tout Solo",
          "Des membres et des rôles, un serveur attribué à une personne",
          "Un journal d’audit de qui a fait quoi",
          "La révocation en un clic quand quelqu’un part",
          "Une facture unique pour toute l’équipe",
        ],
        cta: "Commander",
      },
      hosted: {
        audience: "Qui ne veut pas louer",
        includes: [
          "Un serveur fourni par Pupitre ; vous ne louez rien",
          "Tout Solo",
          "Pas encore ouvert : il vient après Solo et Équipe",
        ],
      },
    },
  },
  stop: {
    label: "À l’arrêt",
    title: "Arrêtez de payer, gardez le serveur",
    lead: "Quand l’abonnement s’arrête, votre serveur continue de fonctionner comme un serveur Ubuntu ordinaire. Les projets, les bases et les services restent où ils sont. Vous perdez Pupitre, rien d’autre.",
    keep: {
      title: "Ce qui reste",
      lines: [
        "Le serveur, avec l’accès SSH comme avant",
        "Vos projets, dans leurs dossiers, démarrés par tmux et systemd",
        "PostgreSQL, MySQL, MongoDB et leurs données",
        "Les tunnels Cloudflare, les runtimes, les éditeurs distants, l’utilisateur dev",
      ],
    },
    lose: {
      title: "Ce que vous perdez",
      lines: [
        "L’app desktop : tableau de bord, projets, terminaux",
        "Le catalogue : installer, mettre à jour, retirer des services",
        "Les mises à jour de l’agent et les alertes",
        "Le support",
      ],
    },
    note: "Pupitre laisse un binaire et quelques fichiers de configuration, que vous pouvez supprimer. Réabonnez-vous et l’app reprend là où elle s’est arrêtée. C’est écrit dans les conditions.",
  },
  diy: {
    label: "Faire soi-même",
    title: "Ce que vous payez, ce que vous payez encore",
    lead: "Tout ce que Pupitre installe est standard : Ubuntu, systemd, tmux, ufw, fail2ban. Vous pouvez le faire à la main. Pupitre remplace les heures, pas la machine.",
    replaces: {
      title: "Ce que Pupitre remplace",
      lines: [
        "Les guides tmux, et la soirée passée à faire survivre les sessions à un capot fermé",
        "Les scripts d’installation copiés d’un serveur à l’autre et plus maintenus",
        "La gestion des clés : paires ed25519, authorized_keys, root fermé, mots de passe désactivés",
        "Les mises à jour des runtimes, des bases et des agents, et ce qui casse après",
        "L’heure que coûte chaque nouveau projet : clone, dépendances, port, URL, logs",
      ],
    },
    keeps: {
      title: "Ce qu’il ne remplace pas",
      lines: [
        "Le VPS : vous le louez où vous voulez et payez l’hébergeur directement",
        "Vos abonnements Claude, Codex ou Hermes : les agents tournent sur vos comptes",
        "Votre jugement : Pupitre exécute ce que vous demandez, sur la machine que vous avez choisie",
      ],
    },
  },
  catalog: {
    label: "Catalogue",
    title: "Compris dans chaque offre",
    lead: "Tout le catalogue vient avec chaque serveur, quelle que soit l’offre. Voici ce qui est disponible aujourd’hui, par catégorie.",
    available: "{count} disponibles",
    soon: "{count} bientôt",
    link: "Voir tout le catalogue",
  },
}
