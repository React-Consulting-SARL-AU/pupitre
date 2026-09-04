import type { HomeContent } from "./home"

export const homeFr: HomeContent = {
  meta: {
    title: "Pupitre — une machine pour vos agents IA",
    description:
      "Une app desktop qui transforme n’importe quel VPS Ubuntu en atelier pour agents IA, et un agent compilé posé sur ce serveur.",
  },
  hero: {
    headline:
      "Vos agents IA travaillent sur une machine à eux. Votre laptop respire.",
    lead: "Pupitre transforme n’importe quel VPS Ubuntu en atelier pour vos agents : il inspecte la machine, installe les services que vous choisissez et la durcit. Vos projets, vos terminaux, vos bases et Claude Code tournent là-bas, et vous voyez tout depuis une app desktop.",
    download: "Télécharger l’app",
    order: "Commander",
    note: "Construit par quelqu’un qui fait tourner ses propres agents sur un VPS tous les jours.",
  },
  features: {
    label: "Ce qu’il fait",
    title: "Dix minutes pour une machine prête, puis tous les jours",
    items: [
      {
        title: "Inspecter et installer",
        lines: [
          "Louez un VPS Ubuntu 22.04 ou 24.04 où vous voulez, 4 Go de RAM, root ou sudo.",
          "Pupitre l’inspecte, dit ce qui va et ce qui manque, et refuse clairement ce qu’il ne sait pas gérer.",
          "Choisissez vos services : il les installe et les configure, durcit la machine avec ufw, fail2ban et SSH ed25519, puis vous fait passer de root à dev.",
        ],
      },
      {
        title: "Piloter au quotidien",
        lines: [
          "Ajoutez un projet par URL git ou dossier : il clone, installe les dépendances, démarre dans tmux et montre l’URL et les logs.",
          "Ouvrez Claude Code, Codex ou Hermes dans le bon dossier, avec le contexte et les skills du projet, sur vos propres abonnements.",
          "Chaque attente dit ce qui se passe — « Installation de PostgreSQL, étape 3 sur 7, 40 s » — et chaque échec affiche la commande qui le répare.",
        ],
      },
      {
        title: "Garder le contrôle",
        lines: [
          "L’app montre ce que l’agent renvoie, rien d’autre : services, versions, projets, ce qui tourne et ce qui est arrêté.",
          "En équipe : un serveur par développeur, des rôles, un journal d’audit, une facture. Quelqu’un part, vous le révoquez en un clic.",
          "Le support voit que votre serveur est enrôlé et quelle version il fait tourner. Il n’entre jamais sur votre machine.",
        ],
      },
    ],
  },
  catalog: {
    label: "Catalogue",
    title: "Ce qu’il installe",
    lead: "Une bibliothèque des stacks vraiment utilisées, choisies parce qu’elles s’installent et se gèrent proprement. Ce qui n’y est pas, vous l’installez vous-même ; Pupitre ne s’y oppose pas.",
  },
  promise: {
    label: "La promesse",
    title: "Trois choses que vous pouvez vérifier",
    items: [
      {
        statement: "Aucune connexion entrante.",
        proof:
          "L’app ouvre une session SSH depuis votre laptop. Le serveur n’écoute rien pour le compte de Pupitre ; ufw laisse passer SSH et rien d’autre.",
      },
      {
        statement: "Aucune clé privée hors de votre laptop.",
        proof:
          "Votre clé ed25519 reste sur votre machine. Le serveur n’en reçoit que la partie publique dans authorized_keys, et la plateforme ne voit ni l’une ni l’autre.",
      },
      {
        statement: "Vous gardez tout si vous partez.",
        proof:
          "À l’arrêt de l’abonnement, le serveur continue comme un serveur ordinaire : projets, bases et services restent. Vous perdez Pupitre, rien d’autre. C’est écrit dans les conditions.",
      },
    ],
  },
  faq: {
    label: "Questions",
    title: "Réponses honnêtes",
    items: [
      {
        question: "Pourquoi pas Claude Code sur le web ?",
        answer:
          "La version web convient à une tâche isolée sur un dépôt. Elle ne vous donne pas une machine : pas de base à côté du code, pas de navigateur headless, pas de service qui tourne la nuit, rien qui persiste une fois la session terminée. Pupitre vous donne la machine, et votre abonnement Claude ou Codex y fonctionne tel quel.",
      },
      {
        question: "Et si je veux partir ?",
        answer:
          "Désinstallez l’app. Le serveur reste à vous, avec ses projets, ses bases et ses services : c’est un Ubuntu ordinaire, configuré avec des outils standards — systemd, tmux, ufw, fail2ban. Pupitre y laisse un binaire et quelques fichiers de configuration, que vous pouvez supprimer.",
      },
      {
        question: "Quel VPS choisir ?",
        answer:
          "Ubuntu 22.04 ou 24.04, 4 Go de RAM minimum, root ou sudo, amd64 ou arm64, chez l’hébergeur de votre choix. Prenez plus de RAM si vous prévoyez un IDE JetBrains distant ou plusieurs bases. Pupitre inspecte la machine avant d’installer quoi que ce soit et vous dit si elle ne suffit pas.",
      },
      {
        question: "Ça marche sous Windows ?",
        answer:
          "L’app desktop tourne sur macOS, Windows 11 et Ubuntu desktop. Le serveur, lui, est toujours un Ubuntu : Pupitre n’installe rien sur un VPS Windows. Visual Studio n’a pas de backend Linux ; l’app le dit et vous renvoie vers VS Code Remote SSH.",
      },
      {
        question: "Que se passe-t-il si l’abonnement s’arrête ?",
        answer:
          "Vous perdez l’app : le tableau de bord, le catalogue, les mises à jour, les sauvegardes et les alertes. Le serveur continue comme un serveur normal — projets, bases, services et tunnels restent en place, et vous vous y connectez en SSH comme avant. Réabonnez-vous et l’app reprend là où elle s’est arrêtée.",
      },
    ],
  },
  pricing: {
    label: "Tarifs",
    title: "Un prix par serveur",
    perServer:
      "{price} € HT par serveur et par mois, en {solo} comme en {team}.",
    annual:
      "À l’année, {months} mois sont offerts : {yearly} € par serveur et par an.",
    trial: "{days} jours d’essai, sans carte.",
    hosted:
      "{hosted}, un serveur fourni par Pupitre, à partir de {price} € par mois. Plus tard.",
    link: "Voir les tarifs",
  },
}
