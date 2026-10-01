import type { PricingContent } from "./pricing"

export const pricingFr: PricingContent = {
  meta: {
    title: "Tarifs — Pupitre",
    description:
      "Pupitre est gratuit pour toute organisation jusqu’à {count} serveurs : ni carte, ni essai, ni abonnement. Au-delà, une licence est accordée sur demande. Le code source est public, et quand vous arrêtez, votre serveur continue de tourner.",
  },
  offer: "Gratuit jusqu’à {count} serveurs par organisation",
  hero: {
    label: "Tarifs",
    headline: "Gratuit. Jusqu’à {count} serveurs par organisation.",
    lead: "L’app, l’agent et tout le catalogue ne coûtent rien pour vos {count} premiers serveurs. Ni carte, ni essai qui s’épuise, ni abonnement. Vous payez le serveur à votre hébergeur, et rien à nous.",
    figure: "Gratuit",
    unit: "jusqu’à {count} serveurs par organisation",
  },
  free: {
    label: "Ce qui est gratuit",
    title: "Tout, sur {count} serveurs",
    lead: "Il n’y a ni édition payante ni fonction mise de côté : les serveurs gratuits reçoivent tout ce que Pupitre sait faire.",
    included: {
      title: "Ce que vous avez",
      lines: [
        "L’app desktop, et l’agent sur chaque serveur",
        "Tout le catalogue : runtimes, bases, agents, éditeurs, exposition",
        "Les mises à jour et les alertes",
        "Des membres et des rôles, et un journal d’audit de qui a fait quoi",
        "Vos propres abonnements Claude, ChatGPT, Cursor, Google ou Copilot",
      ],
    },
    asked: {
      title: "Ce que nous vous demandons",
      lines: [
        "Un compte, avec une adresse mail",
        "Aucune carte, ni à l’inscription ni plus tard",
        "Aucune limite de durée : les serveurs gratuits le restent",
      ],
    },
    signUp: "Créer un compte",
    download: "Télécharger l’app",
  },
  beyond: {
    label: "Au-delà de {count} serveurs",
    title: "Une licence, sur demande",
    lead: "Une organisation qui a besoin de plus de {count} serveurs demande une licence. Elle ajoute aux serveurs gratuits ceux qu’il lui faut, et la plateforme l’accorde.",
    note: "Les licences sont accordées sur demande aujourd’hui, et aucun paiement n’est demandé. Écrivez-nous avec le nom de votre organisation et le nombre de serveurs qu’il vous faut.",
    contact: "Demander une licence",
  },
  source: {
    label: "Code source",
    title: "Le code source est public",
    lead: "Pupitre est publié sous licence Apache 2.0 avec la Commons Clause. C’est un code source ouvert à la lecture, pas un logiciel libre au sens de l’open source : vous pouvez le lire, le modifier et le faire tourner, pas le vendre.",
    allowed: {
      title: "Ce que vous pouvez faire",
      lines: [
        "Lire le code de l’app, de l’agent et de la plateforme",
        "Le modifier, pour vous ou pour votre entreprise",
        "Le faire tourner, y compris une plateforme à vous",
        "Le redistribuer, modifié ou non, avec la licence et la Commons Clause",
      ],
    },
    forbidden: {
      title: "Ce que vous ne pouvez pas faire",
      lines: [
        "Vendre Pupitre, ou un service qui tire l’essentiel de sa valeur de Pupitre",
        "Faire payer vos clients pour installer Pupitre sur leurs serveurs",
        "Employer le nom ou le logo Pupitre pour un produit à vous",
      ],
    },
    licence: "Lire la licence",
    repository: "Voir le code source",
  },
  stop: {
    label: "À l’arrêt",
    title: "Partez, gardez le serveur",
    lead: "Quand vous retirez Pupitre, votre serveur continue de fonctionner comme un serveur Ubuntu ordinaire. Les projets, les bases et les services restent où ils sont. Vous perdez Pupitre, rien d’autre.",
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
    note: "Pupitre laisse un binaire et quelques fichiers de configuration, que vous pouvez supprimer. Enrôlez de nouveau le serveur et l’app reprend là où elle s’est arrêtée.",
  },
  diy: {
    label: "Faire soi-même",
    title: "Ce que Pupitre remplace, ce que vous payez encore",
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
      title: "Ce que vous payez encore",
      lines: [
        "Le VPS : vous le louez où vous voulez et payez l’hébergeur directement",
        "Vos abonnements Claude, ChatGPT, Cursor, Google ou Copilot : les agents tournent sur vos comptes",
      ],
    },
  },
  catalog: {
    label: "Catalogue",
    title: "Compris sur chaque serveur",
    lead: "Tout le catalogue vient avec chaque serveur, gratuit ou sous licence. {count} modules, tous disponibles, par catégorie.",
    available: "{count} disponibles",
    link: "Voir tout le catalogue",
  },
}
