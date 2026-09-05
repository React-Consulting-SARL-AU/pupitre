import type { HomeContent } from "./home"

export const homeFr: HomeContent = {
  meta: {
    title: "Pupitre — une machine pour vos agents IA",
    description:
      "Une app desktop qui transforme n’importe quel VPS Ubuntu en atelier pour agents IA, et un agent compilé posé sur ce serveur.",
  },
  hero: {
    eyebrow: "App desktop · serveur Ubuntu · vos propres clés",
    headline:
      "Vos agents IA travaillent sur une machine à eux. Votre laptop respire.",
    lead: "Pupitre transforme n’importe quel VPS Ubuntu en atelier pour vos agents : il inspecte la machine, installe les services que vous choisissez et la durcit. Vos projets, vos terminaux, vos bases et Claude Code tournent là-bas, et vous voyez tout depuis une app desktop.",
    download: "Télécharger l’app",
    order: "Commander",
    note: "Construit par quelqu’un qui fait tourner ses propres agents sur un VPS tous les jours.",
    specs: [
      "Ubuntu 22.04 / 24.04",
      "4 Go de RAM",
      "SSH ed25519",
      "macOS · Windows · Linux",
    ],
    report: {
      title: "Rapport d’installation",
      caption:
        "Le rapport que l’agent renvoie à la fin d’une installation. L’app affiche cela, et rien qu’elle n’ait reçu.",
      lines: [
        {
          mark: "on",
          module: "core.system",
          detail: "swap 4 Go · utilisateur dev · tmux · zsh",
        },
        {
          mark: "on",
          module: "core.hardening",
          detail: "ufw · fail2ban · root fermé",
        },
        {
          mark: "on",
          module: "runtime.node",
          detail: "node 24.4.0 · bun 1.3.14 · pnpm 10.4.1",
        },
        {
          mark: "on",
          module: "db.postgres",
          detail: "17.4 · 127.0.0.1:5432 · local seulement",
        },
        {
          mark: "warn",
          module: "ai.claude",
          detail: "déconnecté — ouvrez le terminal pour vous connecter",
        },
        {
          mark: "off",
          module: "exposure.cloudflare",
          detail: "non installé",
        },
      ],
      footer: "6 modules · 4 min 12 s · 1 à terminer",
    },
  },
  steps: {
    label: "Onboarding",
    title: "Sept étapes, une fois",
    lead: "L’app mène la machine du vide au prêt. Chaque étape dit ce qu’elle fait et ce qu’elle a changé ; vous pouvez vous arrêter après n’importe laquelle.",
    items: [
      {
        title: "Ajouter le serveur",
        detail:
          "Son adresse et un compte root ou sudo. L’app génère une clé ed25519 pour cet appareil ; la moitié privée ne quitte jamais votre laptop.",
      },
      {
        title: "Inspecter",
        detail:
          "Distribution, RAM, disque, architecture, ce qui est déjà installé. Pupitre dit ce qui va, ce qui manque, et ce qu’il ne gérera pas.",
      },
      {
        title: "Choisir les services",
        detail:
          "Runtimes, bases, agents, éditeurs distants, exposition, outils. Chacun annonce ce qu’il installe et ce qu’il vous demandera.",
      },
      {
        title: "Configurer",
        detail:
          "Versions, ports, comptes, secrets. Les secrets passent par la session SSH et ne sont jamais écrits dans un fichier que vous n’avez pas demandé.",
      },
      {
        title: "Installer",
        detail:
          "Étape par étape, en direct : le module, l’étape, le compteur, la durée. Un échec nomme la commande qui le répare.",
      },
      {
        title: "Durcir et basculer sur dev",
        detail:
          "ufw sur SSH seul, fail2ban, mots de passe désactivés, root fermé en dernier — après que l’app a vérifié que votre clé ouvre le compte dev.",
      },
      {
        title: "Premier projet",
        detail:
          "Une URL git ou un dossier. Clone, dépendances, tmux, le port, l’URL, les logs. À partir de là, c’est votre machine.",
      },
    ],
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
  clients: {
    label: "Votre propre client",
    title: "Travaillez depuis l’app que vous utilisez déjà",
    lead: "Claude et ChatGPT ont chacun une app desktop qui ouvre une session sur une machine distante en SSH. Pointez-en une vers votre serveur et elle arrive dans vos projets, sur les runtimes que Pupitre a installés, à côté de la base dont le projet a besoin. Le terminal de Pupitre devient un choix.",
    items: [
      {
        title: "Claude",
        lines: [
          "Ajoutez le serveur comme connexion distante dans l’app Claude et Claude Code tourne là-bas, pas sur votre laptop.",
          "Il travaille dans le dossier du projet, avec les fichiers d’instructions du projet et les skills Pupitre déjà posés sur la machine.",
          "Votre abonnement, votre session. Rien n’est relayé et rien de vous n’est stocké sur notre plateforme.",
        ],
      },
      {
        title: "ChatGPT et Codex",
        lines: [
          "Pareil en SSH depuis l’app ChatGPT : Codex tourne sur le serveur, avec votre propre abonnement.",
          "Claude Code et Codex cohabitent sur la même machine et voient les mêmes projets, les mêmes runtimes, les mêmes bases.",
          "Les deux ont été installés et tenus à jour par Pupitre : côté serveur, il n’y a rien à préparer.",
        ],
      },
      {
        title: "Éditeurs, et ssh tout court",
        lines: [
          "VS Code, Cursor et Windsurf en Remote SSH, Zed par zed://ssh, JetBrains par Gateway — les backends sont préinstallés.",
          "Ou votre propre terminal : c’est une machine Ubuntu ordinaire, atteinte en dev avec une clé, qui tourne sous systemd et tmux.",
          "Pupitre ne pose aucun verrou. Tout ce qui parle SSH peut se brancher sur le serveur qu’il a installé.",
        ],
      },
    ],
    note: "Vous connectez un agent une fois, depuis la session où vous êtes. Ensuite, l’app Pupitre est là où vivent l’installation, les services et les logs — pas un terminal dans lequel on vous oblige à travailler.",
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
          "Vous perdez l’app : le tableau de bord, le catalogue, les mises à jour et les alertes. Le serveur continue comme un serveur normal — projets, bases, services et tunnels restent en place, et vous vous y connectez en SSH comme avant. Réabonnez-vous et l’app reprend là où elle s’est arrêtée.",
      },
      {
        question: "Suis-je obligé de travailler dans Pupitre ?",
        answer:
          "Non. Le serveur est une machine Ubuntu ordinaire, atteinte en SSH sous dev. L’app Claude et l’app ChatGPT ouvrent toutes deux une session sur une machine distante, comme VS Code, Cursor, Zed et JetBrains Gateway — pointez-en une vers votre serveur et vous êtes dans vos projets, sur les runtimes que Pupitre a installés. L’app, c’est là où vivent l’installation, les services, les alertes et les logs ; son terminal est là pour le jour où vous en voulez un.",
      },
      {
        question: "Le support peut-il entrer sur ma machine ?",
        answer:
          "Non. Rien ne se connecte vers votre serveur, ni la plateforme, ni le support. L’agent ne fait que des appels HTTPS sortants pour son droit d’usage, la moitié publique de vos clés et ses propres mises à jour. Le support voit qu’un serveur est enrôlé et quelle version il fait tourner ; c’est tout.",
      },
    ],
  },
  pricing: {
    label: "Tarifs",
    title: "Un prix par serveur",
    perServer: "{price} HT par serveur et par mois, en {solo} comme en {team}.",
    annual:
      "À l’année, {months} mois sont offerts : {yearly} par serveur et par an.",
    trial: "{days} jours d’essai, sans carte.",
    hosted:
      "{hosted}, un serveur fourni par Pupitre, à partir de {price} par mois. Plus tard.",
    link: "Voir les tarifs",
  },
  cta: {
    title: "Donnez une machine à vos agents.",
    lead: "Téléchargez l’app, pointez-la vers un VPS Ubuntu neuf, et lisez pendant qu’elle travaille. Rien n’est installé sur votre laptop hormis l’app elle-même.",
    download: "Télécharger l’app",
    docs: "Lire la doc",
  },
}
