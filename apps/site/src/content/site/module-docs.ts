import type { ModuleId } from "@pupitre/shared/catalog"
import type { Localized } from "../../lib/i18n"

export interface ModuleDoc {
  installs: Localized[]
  asks: Localized[]
  notes?: Localized
}

export const MODULE_DOCS: Record<ModuleId, ModuleDoc> = {
  "core.system": {
    installs: [
      {
        en: "Base packages, the time zone you pick, and unattended security updates that never reboot the machine on their own.",
        fr: "Les paquets de base, le fuseau que vous choisissez, et les mises à jour de sécurité automatiques qui ne redémarrent jamais la machine d’elles-mêmes.",
      },
      {
        en: "A swap file sized for the RAM, and a memory guard — systemd-oomd or earlyoom — so a runaway build does not take the machine down.",
        fr: "Un fichier d’échange dimensionné pour la RAM, et un garde-fou mémoire — systemd-oomd ou earlyoom — pour qu’un build emballé n’emporte pas la machine.",
      },
      {
        en: "A dev user with sudo, whose authorized_keys receives the unrestricted keys already on root, so a key opens it before hardening closes root.",
        fr: "Un utilisateur dev avec sudo, dont authorized_keys reçoit les clés non restreintes déjà posées sur root, pour qu’une clé l’ouvre avant que le durcissement ne ferme root.",
      },
      {
        en: "tmux, zsh and bash with the OSC 133 prompt markers the app reads to tell one command from the next.",
        fr: "tmux, zsh et bash avec les marqueurs de prompt OSC 133 que l’app lit pour distinguer une commande de la suivante.",
      },
      {
        en: "The dev command, linked to the agent binary, so the same operations exist in a plain SSH terminal.",
        fr: "La commande dev, liée au binaire de l’agent, pour que les mêmes opérations existent dans un terminal SSH ordinaire.",
      },
    ],
    asks: [
      { en: "The time zone.", fr: "Le fuseau horaire." },
      {
        en: "The git name and email the server commits under.",
        fr: "Le nom et l’adresse git sous lesquels le serveur commite.",
      },
      {
        en: "The directory your projects live in.",
        fr: "Le dossier dans lequel vivent vos projets.",
      },
    ],
    notes: {
      en: "This module is mandatory. Everything else assumes the dev user, the projects directory and the shells it sets up.",
      fr: "Ce module est obligatoire. Tout le reste suppose l’utilisateur dev, le dossier des projets et les shells qu’il installe.",
    },
  },
  "core.hardening": {
    installs: [
      {
        en: "ufw, open on SSH only — port 22, and 443 as an option if your network blocks 22.",
        fr: "ufw, ouvert sur SSH seul — le port 22, et 443 en option si votre réseau bloque le 22.",
      },
      {
        en: "fail2ban on the SSH jail, with the defaults Ubuntu ships.",
        fr: "fail2ban sur la prison SSH, avec les réglages par défaut d’Ubuntu.",
      },
      {
        en: "AllowUsers dev and a ClientAlive setting that keeps the app’s session from dropping silently.",
        fr: "AllowUsers dev et un réglage ClientAlive qui empêche la session de l’app de tomber en silence.",
      },
      {
        en: "Root login closed and password authentication disabled — last, and only after the app has verified that your key opens dev.",
        fr: "La connexion root fermée et l’authentification par mot de passe désactivée — en dernier, et seulement après que l’app a vérifié que votre clé ouvre dev.",
      },
    ],
    asks: [
      {
        en: "Whether SSH should also listen on 443.",
        fr: "Si SSH doit aussi écouter sur le 443.",
      },
    ],
    notes: {
      en: "This module is mandatory, and it is the one that can lock you out. It refuses to close root until a key has actually opened dev; if that check fails, nothing is closed and the app tells you why.",
      fr: "Ce module est obligatoire, et c’est celui qui peut vous enfermer dehors. Il refuse de fermer root tant qu’une clé n’a pas réellement ouvert dev ; si cette vérification échoue, rien n’est fermé et l’app dit pourquoi.",
    },
  },
  "runtime.node": {
    installs: [
      {
        en: "mise, as the version manager.",
        fr: "mise, comme gestionnaire de versions.",
      },
      {
        en: "Node at the version you choose, plus Bun and pnpm if you want them.",
        fr: "Node à la version choisie, et Bun et pnpm si vous les voulez.",
      },
      {
        en: "A marked block in .zshenv that activates them in every shell, including the non-interactive ones an agent uses.",
        fr: "Un bloc balisé dans .zshenv qui les active dans tous les shells, y compris les non interactifs qu’utilise un agent.",
      },
    ],
    asks: [
      { en: "The Node version.", fr: "La version de Node." },
      { en: "Bun, yes or no.", fr: "Bun, oui ou non." },
      { en: "pnpm, yes or no.", fr: "pnpm, oui ou non." },
    ],
    notes: {
      en: "The non-interactive activation is the point: an agent that runs npm through ssh without a login shell finds the same versions you do.",
      fr: "L’activation non interactive est l’essentiel : un agent qui lance npm par ssh sans shell de connexion trouve les mêmes versions que vous.",
    },
  },
  "runtime.java": {
    installs: [
      { en: "Temurin through mise.", fr: "Temurin via mise." },
      {
        en: "A Gradle daemon sized for the RAM the machine actually has.",
        fr: "Un daemon Gradle dimensionné pour la RAM dont la machine dispose réellement.",
      },
    ],
    asks: [{ en: "The Java version.", fr: "La version de Java." }],
  },
  "runtime.python": {
    installs: [
      {
        en: "uv, and one Python version.",
        fr: "uv, et une version de Python.",
      },
      {
        en: "The base every Python agent on the machine builds on.",
        fr: "La base sur laquelle s’appuie tout agent Python de la machine.",
      },
    ],
    asks: [{ en: "The Python version.", fr: "La version de Python." }],
  },
  "runtime.go": {
    installs: [{ en: "Go through mise.", fr: "Go via mise." }],
    asks: [{ en: "The version.", fr: "La version." }],
  },
  "runtime.php": {
    installs: [{ en: "PHP through mise.", fr: "PHP via mise." }],
    asks: [{ en: "The version.", fr: "La version." }],
  },
  "runtime.ruby": {
    installs: [{ en: "Ruby through mise.", fr: "Ruby via mise." }],
    asks: [{ en: "The version.", fr: "La version." }],
  },
  "runtime.docker": {
    installs: [
      { en: "Docker Engine and Compose.", fr: "Docker Engine et Compose." },
      {
        en: "The dev user in the docker group.",
        fr: "L’utilisateur dev dans le groupe docker.",
      },
    ],
    asks: [],
  },
  "db.mysql": {
    installs: [
      {
        en: "MySQL 8 or MariaDB, whichever you pick, bound to 127.0.0.1 and nothing else.",
        fr: "MySQL 8 ou MariaDB, selon votre choix, lié à 127.0.0.1 et à rien d’autre.",
      },
      {
        en: "Root on the socket, an application account, and a separate remote account your laptop uses through the SSH session.",
        fr: "Root sur la socket, un compte applicatif, et un compte distant séparé que votre laptop utilise à travers la session SSH.",
      },
      {
        en: "A buffer pool sized for the machine, and an import of any dump you drop in ~/dumps/.",
        fr: "Un buffer pool dimensionné pour la machine, et l’import de tout dump déposé dans ~/dumps/.",
      },
    ],
    asks: [
      { en: "MySQL or MariaDB.", fr: "MySQL ou MariaDB." },
      {
        en: "The application password and the remote password. Both can be generated for you and are never displayed again.",
        fr: "Le mot de passe applicatif et le mot de passe distant. Les deux peuvent être générés pour vous et ne sont jamais réaffichés.",
      },
      { en: "The buffer pool size.", fr: "La taille du buffer pool." },
    ],
    notes: {
      en: "Nothing listens on a public interface. A database client on your laptop reaches the server through the SSH session the app already holds.",
      fr: "Rien n’écoute sur une interface publique. Un client de base sur votre laptop atteint le serveur à travers la session SSH que l’app tient déjà.",
    },
  },
  "db.postgres": {
    installs: [
      {
        en: "PostgreSQL 17, listening on localhost only.",
        fr: "PostgreSQL 17, en écoute sur localhost uniquement.",
      },
      {
        en: "An application role and a remote role, and the extensions most projects reach for.",
        fr: "Un rôle applicatif et un rôle distant, et les extensions dont la plupart des projets ont besoin.",
      },
      {
        en: "An import of the dumps you drop in ~/dumps/.",
        fr: "L’import des dumps que vous déposez dans ~/dumps/.",
      },
    ],
    asks: [
      {
        en: "The application password and the remote password, generated if you like.",
        fr: "Le mot de passe applicatif et le mot de passe distant, générés si vous le souhaitez.",
      },
    ],
  },
  "db.mongodb": {
    installs: [
      { en: "MongoDB 8, local only.", fr: "MongoDB 8, local seulement." },
      { en: "An application user.", fr: "Un utilisateur applicatif." },
      {
        en: "An import of mongodump archives.",
        fr: "L’import d’archives mongodump.",
      },
    ],
    asks: [
      { en: "The application password.", fr: "Le mot de passe applicatif." },
    ],
  },
  "db.redis": {
    installs: [
      {
        en: "Redis, local only, with persistence on.",
        fr: "Redis, local seulement, avec la persistance activée.",
      },
    ],
    asks: [{ en: "The password.", fr: "Le mot de passe." }],
  },
  "ai.claude": {
    installs: [
      {
        en: "Claude Code, ready to sign in through the URL it prints in the app terminal.",
        fr: "Claude Code, prêt à se connecter par l’URL qu’il affiche dans le terminal de l’app.",
      },
      {
        en: "The project context: the app opens it in the right folder, with the files that describe the project.",
        fr: "Le contexte du projet : l’app l’ouvre dans le bon dossier, avec les fichiers qui décrivent le projet.",
      },
      {
        en: "The Pupitre skills — capture a screenshot, open a branch, open a pull request, ship.",
        fr: "Les skills Pupitre — prendre une capture, ouvrir une branche, ouvrir une pull request, livrer.",
      },
    ],
    asks: [],
    notes: {
      en: "Your own subscription. Pupitre resells nothing and stores no token for you: you sign in on the server the same way you would in any terminal. You can also skip Pupitre’s terminal entirely and attach the Claude desktop app to the server over SSH.",
      fr: "Votre propre abonnement. Pupitre ne revend rien et ne stocke aucun jeton pour vous : vous vous connectez sur le serveur comme vous le feriez dans n’importe quel terminal. Vous pouvez aussi vous passer complètement du terminal de Pupitre et brancher l’app Claude sur le serveur en SSH.",
    },
  },
  "ai.codex": {
    installs: [
      {
        en: "Codex, with the same sign-in flow as Claude Code.",
        fr: "Codex, avec le même flux de connexion que Claude Code.",
      },
      {
        en: "The same project context and the same skills.",
        fr: "Le même contexte de projet et les mêmes skills.",
      },
    ],
    asks: [],
    notes: {
      en: "Your own subscription, again. Claude Code and Codex can live on the same machine, and the ChatGPT desktop app can attach to the server over SSH instead of Pupitre’s terminal.",
      fr: "Votre propre abonnement, là encore. Claude Code et Codex peuvent cohabiter sur la même machine, et l’app ChatGPT peut se brancher sur le serveur en SSH plutôt que de passer par le terminal de Pupitre.",
    },
  },
  "ai.hermes": {
    installs: [
      {
        en: "Hermes Agent, from Nous Research, on the Python runtime.",
        fr: "Hermes Agent, de Nous Research, sur le runtime Python.",
      },
      {
        en: "The model providers you configure, and a systemd service if you want it always on.",
        fr: "Les fournisseurs de modèles que vous configurez, et un service systemd si vous le voulez toujours actif.",
      },
    ],
    asks: [
      {
        en: "One key per model provider. They are written to a file only root can read.",
        fr: "Une clé par fournisseur de modèles. Elles sont écrites dans un fichier que seul root peut lire.",
      },
      { en: "Always on, yes or no.", fr: "Toujours actif, oui ou non." },
    ],
  },
  "ai.browser": {
    installs: [
      {
        en: "Headless Chrome and the Playwright dependencies Ubuntu does not ship.",
        fr: "Chrome headless et les dépendances Playwright qu’Ubuntu ne fournit pas.",
      },
      {
        en: "A capture command that files its images in the project gallery, where the app shows them.",
        fr: "Une commande de capture qui range ses images dans la galerie du projet, là où l’app les affiche.",
      },
    ],
    asks: [],
    notes: {
      en: "This is what lets an agent look at the page it just changed instead of guessing.",
      fr: "C’est ce qui permet à un agent de regarder la page qu’il vient de modifier au lieu de la deviner.",
    },
  },
  "editor.jetbrains": {
    installs: [
      {
        en: "The remote development backend for the IDE you choose, in the cache JetBrains Gateway expects, so the first connection is not a ten-minute download.",
        fr: "Le backend de développement distant de l’IDE choisi, dans le cache qu’attend JetBrains Gateway, pour que la première connexion ne soit pas un téléchargement de dix minutes.",
      },
      {
        en: "A JVM and a heap sized for the RAM the machine has.",
        fr: "Une JVM et un tas dimensionnés pour la RAM de la machine.",
      },
    ],
    asks: [
      {
        en: "Which IDE: IntelliJ IDEA, WebStorm, PyCharm, PhpStorm or GoLand.",
        fr: "Quel IDE : IntelliJ IDEA, WebStorm, PyCharm, PhpStorm ou GoLand.",
      },
      {
        en: "The version, which has to match your Gateway.",
        fr: "La version, qui doit correspondre à votre Gateway.",
      },
    ],
    notes: {
      en: "Your licence, on your account. A remote backend is the heaviest thing in the catalogue: plan for 8 GB of RAM if you use one.",
      fr: "Votre licence, sur votre compte. Un backend distant est ce qu’il y a de plus lourd dans le catalogue : prévoyez 8 Go de RAM si vous en utilisez un.",
    },
  },
  "editor.vscode": {
    installs: [
      {
        en: "The code CLI and the remote server, preinstalled so the first Remote SSH connection is immediate.",
        fr: "La CLI code et le serveur distant, préinstallés pour que la première connexion Remote SSH soit immédiate.",
      },
      {
        en: "The extensions you list, and a Remote Tunnel if you ask for one.",
        fr: "Les extensions que vous listez, et un Remote Tunnel si vous en demandez un.",
      },
      {
        en: "The same mechanism for Cursor and Windsurf, which use the same remote server.",
        fr: "Le même mécanisme pour Cursor et Windsurf, qui utilisent le même serveur distant.",
      },
    ],
    asks: [
      {
        en: "The extensions to preinstall.",
        fr: "Les extensions à préinstaller.",
      },
      { en: "Remote Tunnel, yes or no.", fr: "Remote Tunnel, oui ou non." },
    ],
    notes: {
      en: "Visual Studio has no Linux backend. If you ask for it the app says so and points you here.",
      fr: "Visual Studio n’a pas de backend Linux. Si vous le demandez, l’app le dit et vous renvoie ici.",
    },
  },
  "editor.zed": {
    installs: [
      {
        en: "The Zed remote server for your version, so zed://ssh opens straight away.",
        fr: "Le serveur distant Zed pour votre version, pour que zed://ssh ouvre immédiatement.",
      },
    ],
    asks: [
      {
        en: "The version. Zed requires the remote server to match your client exactly.",
        fr: "La version. Zed exige que le serveur distant corresponde exactement à votre client.",
      },
    ],
  },
  "exposure.cloudflare": {
    installs: [
      {
        en: "One tunnel for the machine, and one route per project you choose to expose.",
        fr: "Un tunnel pour la machine, et une route par projet que vous choisissez d’exposer.",
      },
      {
        en: "The DNS record and the certificate, managed for you, on a subdomain taken from the project registry.",
        fr: "L’enregistrement DNS et le certificat, gérés pour vous, sur un sous-domaine tiré du registre des projets.",
      },
    ],
    asks: [
      {
        en: "A Cloudflare API token, your account id, the zone and the domain.",
        fr: "Un jeton d’API Cloudflare, votre identifiant de compte, la zone et le domaine.",
      },
    ],
    notes: {
      en: "A tunnel is an outbound connection: it opens no port on your server. The firewall stays closed on everything but SSH.",
      fr: "Un tunnel est une connexion sortante : il n’ouvre aucun port sur votre serveur. Le pare-feu reste fermé sur tout sauf SSH.",
    },
  },
  "exposure.ssh": {
    installs: [
      {
        en: "Nothing public. Each project listens on its own port on localhost, and the app reaches it through the SSH session it already holds.",
        fr: "Rien de public. Chaque projet écoute sur son port en local, et l’app l’atteint à travers la session SSH qu’elle tient déjà.",
      },
    ],
    asks: [],
    notes: {
      en: "The default, and the right one while a project is not ready to be seen.",
      fr: "Le choix par défaut, et le bon tant qu’un projet n’est pas prêt à être vu.",
    },
  },
  "exposure.caddy": {
    installs: [
      {
        en: "Caddy as a reverse proxy, with automatic certificates, for a domain that is not on Cloudflare.",
        fr: "Caddy en reverse proxy, avec certificats automatiques, pour un domaine qui n’est pas chez Cloudflare.",
      },
    ],
    asks: [{ en: "The domain.", fr: "Le domaine." }],
    notes: {
      en: "This one does open ports 80 and 443. It is the only module that does.",
      fr: "Celui-ci ouvre bien les ports 80 et 443. C’est le seul module qui le fasse.",
    },
  },
  "tool.github": {
    installs: [
      {
        en: "gh, signed in with your token.",
        fr: "gh, connecté avec votre jeton.",
      },
      {
        en: "HTTPS cloning that needs no key on the server.",
        fr: "Le clone HTTPS qui n’a besoin d’aucune clé sur le serveur.",
      },
      {
        en: "The server’s own key, registered on your account, for the operations that want SSH.",
        fr: "La clé propre au serveur, enregistrée sur votre compte, pour les opérations qui veulent SSH.",
      },
    ],
    asks: [
      {
        en: "A GitHub token. It travels over the SSH session and lands in a file only root can read.",
        fr: "Un jeton GitHub. Il passe par la session SSH et atterrit dans un fichier que seul root peut lire.",
      },
    ],
  },
  "tool.1password": {
    installs: [
      {
        en: "The 1Password CLI and a service account.",
        fr: "La CLI 1Password et un compte de service.",
      },
      {
        en: "Generation of .env.local from the templates your repositories already carry.",
        fr: "La génération des .env.local depuis les gabarits que vos dépôts portent déjà.",
      },
    ],
    asks: [
      {
        en: "A service account token, scoped to the vaults you want the server to read.",
        fr: "Un jeton de compte de service, limité aux coffres que le serveur doit lire.",
      },
    ],
    notes: {
      en: "Secrets stay in your vault. The server reads them when it builds an env file; it stores no copy of the vault.",
      fr: "Les secrets restent dans votre coffre. Le serveur les lit au moment de construire un fichier d’environnement ; il ne garde aucune copie du coffre.",
    },
  },
  "tool.neon": {
    installs: [
      {
        en: "A Neon branch for every project that declares one.",
        fr: "Une branche Neon pour chaque projet qui en déclare une.",
      },
    ],
    asks: [{ en: "A Neon API key.", fr: "Une clé d’API Neon." }],
  },
}
