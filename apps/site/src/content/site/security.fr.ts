import type { SecurityContent } from "./security"

export const securityFr: SecurityContent = {
  meta: {
    title: "Sécurité — Pupitre",
    description:
      "Ce que Pupitre peut et ne peut pas faire sur votre serveur, ce que la plateforme en sait, et la commande qui vérifie chaque affirmation. Où lire le code, ce qui se passe si Pupitre s’arrête, et comment le retirer.",
  },
  hero: {
    label: "Sécurité",
    headline:
      "Vous installez notre agent en root. Voici ce qu’il peut faire, et ce qu’il ne peut pas.",
    lead: "Pupitre pose un binaire compilé sur un serveur à vous, avec les droits root. Cela demande de la confiance : le code source est donc public, et chaque affirmation ci-dessous vient avec la commande qui la vérifie sur votre propre machine.",
    cta: "Lire la documentation sécurité",
  },
  guarantees: {
    label: "Garanties",
    title: "Sept affirmations, chacune vérifiable",
    lead: "Lancez la commande sur le serveur, ou sur votre ordinateur quand c’est indiqué.",
    checkLabel: "Vérifier",
    items: [
      {
        statement: "Rien ne se connecte à votre serveur.",
        proof:
          "L’app ouvre une session SSH depuis votre ordinateur ; l’agent ne fait que des appels HTTPS sortants. Ni la plateforme ni le support n’ouvrent de connexion vers la machine. Le pare-feu laisse entrer SSH, et les ports 80 et 443 seulement une fois Caddy installé.",
        check: "sudo ufw status",
      },
      {
        statement: "Vos clés privées restent sur votre ordinateur.",
        proof:
          "L’app crée ses clés ed25519 dans son propre dossier, en mode 0600. Seules les moitiés publiques en sortent : vers le authorized_keys du serveur, et vers la plateforme, qui les transmet aux serveurs de votre organisation.",
        check: "cat ~/.ssh/authorized_keys",
      },
      {
        statement: "La plateforme ne peut faire entrer personne.",
        proof:
          "L’agent n’ajoute une clé que si un appareil qu’il tient déjà pour sûr a signé son approbation. La plateforme ne détient aucune clé privée et ne peut donc pas en fabriquer : une intrusion sur notre plateforme ou dans une session d’administration n’ouvre pas votre serveur.",
        check: "sudo cat /etc/pupitre/signers.json",
      },
      {
        statement: "Vos agents de code ne deviennent pas root.",
        proof:
          "Tout ce qui tourne sous dev, vos agents compris, tourne sans surveillance. La sécurisation donne à dev un mot de passe sudo que seul votre ordinateur connaît. Deux lignes de commande exactes s’en passent, toutes deux celles de l’agent, et la session qu’elles ouvrent refuse tout ce qui configure la machine.",
        check: "sudo -l",
      },
      {
        statement: "Vos projets publiés ne s’ouvrent qu’avec une clé.",
        proof:
          "Chaque adresse que le tunnel ou Caddy publie passe par un portier de l’agent, et répond 401 à qui n’a pas de clé d’accès. Les clés sont tirées sur votre ordinateur, le serveur n’en garde que l’empreinte, et ouvrir un projet à tous demande votre mot de passe sudo. Lancez la vérification depuis n’importe quelle machine.",
        check: "curl -sI https://votre-projet.exemple.fr",
      },
      {
        statement: "Rien de lisible n’est laissé sur le serveur.",
        proof:
          "Un binaire compilé, des unités systemd générées et des fichiers de configuration lisibles par root seul. Pas de script, pas de source. Les mots de passe de vos services vivent dans un fichier, sur votre serveur, et n’atteignent jamais la plateforme.",
        check: "sudo ls -la /etc/pupitre",
      },
      {
        statement: "Votre serveur n’a pas besoin de nous pour tourner.",
        proof:
          "Arrêtez l’agent : tout le reste continue de tourner, projets, bases, services, SSH. Relancez-le avec systemctl start. Coupé de la plateforme, l’agent fonctionne sept jours, puis cesse seulement d’accepter des changements. Il n’arrête jamais ce qui tourne.",
        check: "sudo systemctl stop pupitred",
      },
    ],
  },
  platform: {
    label: "La plateforme",
    title:
      "Ce que nous savons de votre serveur, et ce que nous ne voyons jamais",
    knows: {
      title: "Ce que la plateforme conserve",
      items: [
        "Votre compte, votre organisation et les clés publiques de vos appareils.",
        "Pour chaque serveur : son nom, son adresse, son architecture et la version de l’agent.",
        "Les services et les sessions de terminal qu’il fait tourner, et ses relevés de santé sur sept jours.",
        "L’état de ses sauvegardes : quand, quelle taille, réussies ou non.",
      ],
    },
    never: {
      title: "Ce qu’elle ne reçoit jamais",
      items: [
        "Votre code, vos fichiers, vos bases de données.",
        "Vos conversations avec vos agents. Elles vont de votre serveur au fournisseur de modèles que vous avez choisi, sur votre compte.",
        "Vos mots de passe, jetons et clés d’API.",
        "Un shell, une clé du support ou tout autre moyen d’entrer sur la machine.",
      ],
    },
  },
  questions: {
    label: "Questions",
    title: "Les questions à poser avant d’installer",
    items: [
      {
        id: "source",
        question: "Puis-je lire le code ?",
        paragraphs: [
          "Oui. Le code de l’app, de l’agent et de la plateforme est public, sous licence Apache 2.0 avec la Commons Clause : vous pouvez le lire, le modifier, compiler l’agent vous-même et faire tourner votre propre plateforme. La seule chose que la licence interdit, c’est de vendre Pupitre, ou un service bâti pour l’essentiel sur lui.",
          "Vous n’avez pas besoin de lire la source pour savoir ce que l’agent a fait à votre machine. Tout ce qu’il installe est un logiciel standard, configuré dans des fichiers ordinaires que vous pouvez ouvrir, comme /etc/ssh/sshd_config.d/10-pupitre.conf ou le Caddyfile. La documentation dit ce que chaque module installe, modifie et retire.",
        ],
        link: { href: "/legal/licence/", label: "Ce que la licence permet" },
      },
      {
        id: "shutdown",
        question: "Et si Pupitre s’arrête ?",
        paragraphs: [
          "Nous ne pouvons pas promettre que l’entreprise sera toujours là. Nous avons construit Pupitre pour que votre machine n’en dépende pas.",
          "Sans la plateforme, l’app et l’agent fonctionnent sept jours. Ensuite, l’agent cesse d’accepter des changements et garde tout ce qui tourne. Vous gardez votre serveur, avec SSH sous dev avec votre clé, vos éditeurs et Claude ou Codex en SSH, vos services, vos bases et vos projets, et vos sauvegardes dans votre propre seau. Rien sur la machine n’a besoin de nous pour démarrer, tourner ou redémarrer.",
        ],
      },
      {
        id: "removal",
        question: "Comment retirer Pupitre ?",
        paragraphs: [
          "Une commande sur le serveur retire l’agent, ses services et son état. Vos services, vos bases, vos projets, le compte dev et la sécurisation restent, vos clés aussi. Supprimez le serveur dans l’app ou la console pour libérer son siège.",
        ],
        command: "sudo pupitred uninstall",
        link: {
          href: "/docs/account/uninstall/",
          label: "Ce qui est retiré, et ce qui reste",
        },
      },
      {
        id: "builder",
        question: "Qui construit Pupitre ?",
        paragraphs: [
          "{owner}, développeur belge installé au Maroc, seul, qui fait travailler des agents de code sur un VPS tous les jours. Pupitre est l’outil construit pour ce travail.",
          "Les règles de cette page sont écrites dans les spécifications contre lesquelles le code est testé. Chaque changement passe par des tests et est essayé sur des serveurs Ubuntu jetables, et {owner} valide chaque version avant sa sortie.",
        ],
      },
    ],
  },
  closing: {
    title: "Vous avez trouvé une vulnérabilité ?",
    body: "Écrivez à {email}, en français ou en anglais. Nous accusons réception sous cinq jours ouvrés, convenons avec vous d’une date de publication, et vous remercions nommément dans les notes de version si vous le souhaitez.",
    policy: "Politique de divulgation",
    docs: "La sécurité dans la documentation",
  },
}
