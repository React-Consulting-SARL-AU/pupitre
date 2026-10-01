import type { HomeContent } from "./home"

export const homeFr: HomeContent = {
  meta: {
    title: "Pupitre — une machine pour vos agents IA",
    description:
      "Une app pour Mac, Windows et Linux qui prépare pour vous un serveur loué — un VPS — et y installe vos outils, vos bases et vos agents IA. Sans une seule ligne de commande.",
  },
  hero: {
    eyebrow: "Gratuit et code source ouvert",
    headline:
      "Vos agents IA travaillent sur une machine à eux. Votre laptop respire.",
    cooled: "respire",
    lead: "Louez un serveur qui reste allumé jour et nuit, et laissez Pupitre le préparer à votre place. Vos outils, vos bases de données et vos agents s’installent tout seuls, et vous suivez tout depuis une app posée sur votre bureau.",
    signUp: "Créer un compte",
    download: "Télécharger l’app",
    note: "Pour Mac, Windows et Linux, sans une ligne de commande à taper : vous cochez, Pupitre installe, vous regardez faire.",
  },
  stack: {
    title: "Tout ça, installé pour vous",
    lead: "Vous cochez ce dont vous avez besoin. Pupitre s’occupe des versions, des réglages et des mises à jour.",
    note: "Et une vingtaine d’autres, à ajouter ou à retirer quand vous voulez.",
    link: "Voir tout ce qu’il installe",
  },
  name: {
    label: "Le mot",
    word: "pupitre",
    pronunciation: "py.pitʁ",
    grammar: "nom masculin",
    senses: [
      "Le banc d’écolier. Le couvercle en pente qu’on soulevait pour retrouver ses livres, deux par table, au fond de la classe.",
      "Par extension, le lutrin où lit un chef d’orchestre, et la console où s’assoit un ingénieur.",
    ],
  },
  steps: {
    label: "Comment ça marche",
    title: "Six marches, et vous ne les montez qu’une fois",
    lead: "Comptez une demi-heure au plus, dont l’essentiel se passe pendant que vous regardez l’app travailler.",
    items: [
      {
        title: "Vous êtes ici",
        detail:
          "Ce site dit ce que Pupitre installe, ce qu’il laisse sur votre machine et ce qu’il coûte. Lisez le catalogue et les tarifs avant tout le reste.",
      },
      {
        title: "Créez votre compte",
        detail:
          "Une adresse mail suffit. Le compte porte votre organisation, ses membres et les serveurs que vous y rattachez.",
      },
      {
        title: "Commencez gratuitement",
        detail:
          "Jusqu’à {count} serveurs par organisation, sans carte bancaire, sans essai et sans limite de durée. Vous avez tout le catalogue et tout ce que l’app sait faire.",
      },
      {
        title: "Téléchargez l’app",
        detail:
          "Mac, Windows ou Linux. C’est la seule chose qui s’installe sur votre propre ordinateur.",
      },
      {
        title: "Liez l’app à votre compte",
        detail:
          "L’app affiche un code, vous le confirmez dans votre compte, et les deux se reconnaissent désormais.",
      },
      {
        title: "Laissez-la préparer votre serveur",
        detail:
          "Louez une machine chez l’hébergeur de votre choix, donnez-lui son adresse, cochez ce que vous voulez, et regardez faire.",
      },
    ],
  },
  features: {
    label: "Ce que ça change",
    title: "Une machine de travail qui ne vous demande rien",
    items: [
      {
        title: "Votre ordinateur souffle",
        lines: [
          "Les agents, les projets et les bases de données tournent sur le serveur, pas sur la vôtre.",
          "Vous refermez votre portable : tout continue là-bas, et vous retrouvez tout en l’ouvrant.",
        ],
      },
      {
        title: "Rien à configurer",
        lines: [
          "Aucune commande à copier-coller, aucun fichier à modifier, aucun tutoriel à suivre jusqu’au bout.",
          "Chaque attente dit ce qui se passe, et quand quelque chose échoue, l’app affiche le bouton qui répare.",
        ],
      },
      {
        title: "Vos comptes restent les vôtres",
        lines: [
          "Claude Code et Codex s’installent sur le serveur et se connectent à vos propres abonnements.",
          "Votre code et vos conversations vont de votre serveur au fournisseur de modèle que vous avez choisi, sur votre compte, jamais par Pupitre.",
        ],
      },
    ],
  },
  clients: {
    label: "Vos outils",
    title: "Travaillez depuis l’app que vous aimez déjà",
    lead: "Pupitre ne vous oblige à rien. Sa fenêtre est là pour installer, surveiller et dépanner ; pour écrire du code, vous gardez vos habitudes.",
    items: [
      {
        title: "Claude",
        lines: [
          "Ajoutez votre serveur dans l’app Claude, et Claude Code travaille là-bas, dans vos projets.",
          "Il retrouve les instructions et les outils du projet, déjà posés sur le serveur par Pupitre.",
        ],
      },
      {
        title: "ChatGPT et Codex",
        lines: [
          "Même chose depuis l’app ChatGPT : Codex tourne sur le serveur, avec votre abonnement.",
          "Les deux agents cohabitent et voient les mêmes projets, les mêmes outils, les mêmes bases.",
        ],
      },
      {
        title: "Votre éditeur de code",
        lines: [
          "VS Code, Cursor, Zed et les éditeurs JetBrains savent tous ouvrir un dossier sur une machine distante.",
          "Pointez le vôtre vers le serveur et vous écrivez comme d’habitude, avec vos extensions et vos raccourcis.",
        ],
      },
    ],
    note: "Vous connectez chaque outil une fois.",
  },
  catalog: {
    label: "Catalogue",
    title: "Ce que Pupitre sait installer",
    lead: "Une bibliothèque des outils vraiment utilisés, choisis parce qu’ils s’installent et se tiennent à jour proprement. Ce qui n’y est pas, vous pouvez l’installer vous-même : la machine reste la vôtre.",
  },
  promise: {
    label: "La promesse",
    title: "Quatre choses que vous pouvez vérifier",
    items: [
      {
        statement: "Nous ne nous connectons jamais à votre serveur.",
        proof:
          "C’est votre ordinateur qui va lui parler, jamais l’inverse : ni la plateforme ni notre support n’ouvrent jamais de connexion vers lui. Son pare-feu laisse entrer votre propre connexion, et les ports web 80 et 443 seulement une fois Caddy installé pour publier vos projets.",
      },
      {
        statement: "Vos clés ne quittent pas votre ordinateur.",
        proof:
          "Pupitre fabrique sur votre ordinateur la clé qui ouvre le serveur. Elle reste chez vous, et nous n’en avons aucune copie.",
      },
      {
        statement: "La machine reste la vôtre.",
        proof:
          "Vous en gardez les pleins droits. Installez ce que vous voulez, y compris ce que Pupitre ne propose pas, hébergez-y ce que vous voulez, connectez-vous-y sans passer par l’app. Pupitre ne gère que ce qu’il a posé lui-même.",
      },
      {
        statement: "Vous gardez tout si vous partez.",
        proof:
          "Retirez Pupitre et le serveur continue de tourner, avec vos projets, vos bases et vos données. Vous perdez l’app, rien d’autre.",
      },
    ],
  },
  faq: {
    label: "Questions",
    title: "Réponses honnêtes",
    items: [
      {
        question: "Je n’ai jamais loué de serveur. C’est pour moi ?",
        answer:
          "Oui, c’est même pour ça que Pupitre existe. Un serveur — un VPS, dans le jargon — c’est simplement un ordinateur que vous louez chez un hébergeur et qui reste allumé en permanence. Vous le commandez en trois clics, vous recevez une adresse et un mot de passe par mail, et vous les recopiez dans Pupitre. À partir de là, l’app fait le reste et vous explique ce qu’elle fait.",
      },
      {
        question: "Qu’est-ce que je dois savoir faire ?",
        answer:
          "Rien de particulier. Si vous savez installer une application sur votre ordinateur, vous savez utiliser Pupitre. L’app ne vous demande jamais de taper une commande : elle pose ses questions en clair, coche des cases à votre place quand la réponse est évidente, et quand quelque chose se passe mal, elle affiche le bouton qui répare plutôt qu’un message d’erreur.",
      },
      {
        question: "Combien ça coûte en tout ?",
        answer:
          "Seulement le serveur, que vous payez à votre hébergeur — comptez cinq à dix euros par mois pour commencer. Pupitre est gratuit jusqu’à {count} serveurs par organisation, sans carte bancaire ; au-delà, une licence est accordée sur demande. Vos abonnements Claude ou ChatGPT restent les vôtres et ne changent pas.",
      },
      {
        question: "Est-ce que mon code reste privé ?",
        answer:
          "Votre code, vos données et vos conversations avec les agents vivent sur votre serveur. Quand un agent travaille, ce qu’il lit part de votre serveur vers le fournisseur de modèle que vous avez choisi — Anthropic pour Claude, OpenAI pour Codex —, sur votre propre compte, jamais par Pupitre, et nous n’en gardons aucune copie. La plateforme connaît le nom et l’adresse de votre serveur, son architecture, la version de l’agent, les services et les sessions de terminal qu’il fait tourner, ses relevés de santé et l’état de ses sauvegardes — jamais le contenu de vos fichiers, de vos bases ni de vos conversations. C’est ce qui lui permet de vous prévenir quand une mise à jour attend ou qu’une sauvegarde a échoué.",
      },
      {
        question: "Est-ce que le serveur ne sert qu’à Pupitre ?",
        answer:
          "Non, il est à vous et vous en faites ce que vous voulez. C’est un serveur Ubuntu ordinaire dont vous êtes l’administrateur : vous pouvez y héberger un site, y faire tourner un service à vous, y installer des outils absents du catalogue, ou y entrer directement sans ouvrir l’app. Pupitre installe et surveille ce qu’il a posé, et ne touche à rien d’autre : son travail s’arrête à monter votre environnement de développement à distance et à le tenir à jour.",
      },
      {
        question: "Et si je veux arrêter ?",
        answer:
          "Vous désinstallez l’app. Le serveur reste à vous et continue de tourner exactement pareil : vos projets, vos bases et vos outils sont toujours là, installés avec des outils standards que n’importe quel développeur sait reprendre. Pupitre n’enferme rien et ne verrouille rien.",
      },
      {
        question: "Ça marche sur mon ordinateur ?",
        answer:
          "L’app tourne sur Mac, sur Windows 11 et sur Ubuntu. Le serveur que vous louez, lui, tourne toujours sous Ubuntu : c’est le système que Pupitre sait préparer, et l’app vérifie qu’il convient avant d’y toucher. Si ce n’est pas le cas, elle vous le dit avant que vous ayez payé quoi que ce soit.",
      },
    ],
  },
  pricing: {
    label: "Tarifs",
    title: "Gratuit jusqu’à {count} serveurs",
    figure: "Gratuit",
    lead: "Pupitre ne coûte rien pour les {count} premiers serveurs de chaque organisation : l’app, l’agent et tout le catalogue.",
    lines: [
      "Ni carte, ni essai, ni abonnement.",
      "Au-delà de {count} serveurs, une licence est accordée sur demande.",
      "Le code source est public : vous pouvez le lire, le modifier et le faire tourner vous-même.",
    ],
    link: "Voir les tarifs",
  },
  cta: {
    title: "Donnez une machine à vos agents.",
    lead: "Créez votre compte, puis téléchargez l’app et indiquez-lui le serveur que vous venez de louer. Sur votre ordinateur, rien d’autre ne s’installe que l’app elle-même.",
    signUp: "Créer un compte",
    docs: "Lire la doc",
  },
}
