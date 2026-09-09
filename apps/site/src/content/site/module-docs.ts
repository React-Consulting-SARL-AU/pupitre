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
        en: "Password authentication disabled, and root login closed unless you keep it — last, and only after the app has verified that your key opens dev.",
        fr: "L’authentification par mot de passe désactivée, et la connexion root fermée sauf si vous la gardez — en dernier, et seulement après que l’app a vérifié que votre clé ouvre dev.",
      },
    ],
    asks: [
      {
        en: "Whether SSH should also listen on 443.",
        fr: "Si SSH doit aussi écouter sur le 443.",
      },
      {
        en: "Whether to keep root access. Off, root is closed and dev becomes the only way in; on, root stays reachable by SSH key — never by password — and the rest of the hardening applies unchanged.",
        fr: "S’il faut garder l’accès root. Décoché, root est fermé et dev devient la seule entrée ; coché, root reste joignable par clé SSH — jamais par mot de passe — et tout le reste du durcissement s’applique à l’identique.",
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
    installs: [
      {
        en: "Go at the major version you pick, through mise, active in every shell including the one an ssh command opens.",
        fr: "Go à la version majeure choisie, via mise, actif dans tous les shells, y compris celui qu’ouvre une commande ssh.",
      },
      {
        en: "GOPATH and its bin folder on the path, so what go install puts there is reachable by name.",
        fr: "GOPATH et son dossier bin sur le PATH, pour que ce que go install y dépose s’appelle par son nom.",
      },
    ],
    asks: [
      { en: "The Go version.", fr: "La version de Go." },
      {
        en: "GOPATH, if ~/go is not where you want the modules and the binaries.",
        fr: "GOPATH, si ~/go n’est pas là où vous voulez les modules et les binaires.",
      },
    ],
    notes: {
      en: "Uninstalling takes back Go and the shell block. The module cache and whatever you installed into GOPATH stay: they are your work, not ours.",
      fr: "La désinstallation reprend Go et le bloc de shell. Le cache de modules et ce que vous avez installé dans GOPATH restent : c’est votre travail, pas le nôtre.",
    },
  },
  "runtime.php": {
    installs: [
      {
        en: "The headers PHP needs to build, then PHP itself at the version you pick, compiled by mise.",
        fr: "Les en-têtes dont PHP a besoin pour se compiler, puis PHP lui-même à la version choisie, compilé par mise.",
      },
      {
        en: "Composer, if you want it, and a php.ini of ours read after the one the build ships.",
        fr: "Composer, si vous le voulez, et un php.ini à nous lu après celui que la compilation livre.",
      },
    ],
    asks: [
      { en: "The PHP version.", fr: "La version de PHP." },
      {
        en: "Whether to install Composer.",
        fr: "S’il faut installer Composer.",
      },
      {
        en: "The CLI memory limit. Empty means 512M.",
        fr: "La limite mémoire du CLI. Vide vaut 512M.",
      },
    ],
    notes: {
      en: "PHP is built from source, so the first install is the long one — several minutes. Replaying it afterwards changes nothing and takes seconds.",
      fr: "PHP est compilé depuis les sources : la première installation est la longue, plusieurs minutes. La rejouer ensuite ne change rien et prend quelques secondes.",
    },
  },
  "runtime.ruby": {
    installs: [
      {
        en: "The headers Ruby needs to build, then Ruby itself at the version you pick, compiled by mise.",
        fr: "Les en-têtes dont Ruby a besoin pour se compiler, puis Ruby lui-même à la version choisie, compilé par mise.",
      },
      {
        en: "A current Bundler, if you want one, and its binaries on the path.",
        fr: "Un Bundler à jour, si vous en voulez un, et ses binaires sur le PATH.",
      },
    ],
    asks: [
      { en: "The Ruby version.", fr: "La version de Ruby." },
      {
        en: "Whether to refresh Bundler.",
        fr: "S’il faut rafraîchir Bundler.",
      },
    ],
    notes: {
      en: "Ruby is built from source, so the first install is the long one. A Bundler that refuses to install is a warning, not a failure: the one shipped with the interpreter stays.",
      fr: "Ruby est compilé depuis les sources : la première installation est la longue. Un Bundler qui refuse de s’installer est un avertissement, pas un échec : celui livré avec l’interpréteur reste en place.",
    },
  },
  "runtime.docker": {
    installs: [
      {
        en: "Docker Engine from Docker’s own repository, and the Compose and buildx plugins with it.",
        fr: "Docker Engine depuis le dépôt de Docker, et les plugins Compose et buildx avec lui.",
      },
      {
        en: "The dev user in the docker group, so no docker command on this machine needs sudo.",
        fr: "L’utilisateur dev dans le groupe docker, pour qu’aucune commande docker sur cette machine ne demande sudo.",
      },
      {
        en: "A daemon configuration that rotates container logs instead of letting them fill the disk.",
        fr: "Une configuration du démon qui fait tourner les logs des conteneurs au lieu de les laisser remplir le disque.",
      },
    ],
    asks: [
      {
        en: "Whether to install Compose.",
        fr: "S’il faut installer Compose.",
      },
      {
        en: "Where images live. Empty means /var/lib/docker; give a path if another disk has the room.",
        fr: "Où vivent les images. Vide vaut /var/lib/docker ; donnez un chemin si un autre disque a la place.",
      },
      {
        en: "The size of one log file. Empty means 10m, kept three deep per container.",
        fr: "La taille d’un fichier de log. Vide vaut 10m, gardé sur trois fichiers par conteneur.",
      },
    ],
    notes: {
      en: "The daemon listens on its socket and on nothing else. Uninstalling takes back the engine and leaves your images, volumes and containers where they are.",
      fr: "Le démon écoute sur sa socket et sur rien d’autre. La désinstallation reprend le moteur et laisse vos images, volumes et conteneurs là où ils sont.",
    },
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
      { en: "The port. 3306 by default.", fr: "Le port. 3306 par défaut." },
      {
        en: "The names of the application account and the remote account.",
        fr: "Les noms du compte applicatif et du compte distant.",
      },
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
        en: "PostgreSQL at the major version you pick, from the project’s own repository, listening on localhost only.",
        fr: "PostgreSQL à la version majeure choisie, depuis le dépôt du projet, en écoute sur localhost uniquement.",
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
      { en: "The major version.", fr: "La version majeure." },
      { en: "The port. 5432 by default.", fr: "Le port. 5432 par défaut." },
      {
        en: "The names of the application role and the remote role.",
        fr: "Les noms du rôle applicatif et du rôle distant.",
      },
      {
        en: "The application password and the remote password, generated if you like.",
        fr: "Le mot de passe applicatif et le mot de passe distant, générés si vous le souhaitez.",
      },
    ],
  },
  "db.mongodb": {
    installs: [
      {
        en: "MongoDB at the major version you pick, local only, with authentication on.",
        fr: "MongoDB à la version majeure choisie, local seulement, authentification active.",
      },
      { en: "An application user.", fr: "Un utilisateur applicatif." },
      {
        en: "An import of mongodump archives.",
        fr: "L’import d’archives mongodump.",
      },
    ],
    asks: [
      { en: "The major version.", fr: "La version majeure." },
      { en: "The port. 27017 by default.", fr: "Le port. 27017 par défaut." },
      {
        en: "The name of the application user.",
        fr: "Le nom de l’utilisateur applicatif.",
      },
      { en: "The application password.", fr: "Le mot de passe applicatif." },
    ],
  },
  "db.redis": {
    installs: [
      {
        en: "Redis bound to 127.0.0.1 on the port you pick, refusing anyone who does not have the password.",
        fr: "Redis lié à 127.0.0.1 sur le port choisi, refusant quiconque n’a pas le mot de passe.",
      },
      {
        en: "The append-only journal, if you want the data to survive a restart, and a memory ceiling if you want one.",
        fr: "Le journal append-only, si vous voulez que les données survivent à un redémarrage, et un plafond mémoire si vous en voulez un.",
      },
    ],
    asks: [
      {
        en: "The password. It can be generated for you and is never displayed again.",
        fr: "Le mot de passe. Il peut être généré pour vous et n’est jamais réaffiché.",
      },
      { en: "The port. 6379 by default.", fr: "Le port. 6379 par défaut." },
      {
        en: "Whether to keep persistence on.",
        fr: "S’il faut garder la persistance.",
      },
      {
        en: "The memory ceiling in megabytes. Zero means no ceiling.",
        fr: "Le plafond mémoire en mégaoctets. Zéro veut dire aucun plafond.",
      },
    ],
    notes: {
      en: "Uninstalling takes back the package and the configuration. What Redis wrote under /var/lib/redis stays: it is your data.",
      fr: "La désinstallation reprend le paquet et la configuration. Ce que Redis a écrit sous /var/lib/redis reste : ce sont vos données.",
    },
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
        en: "A Cloudflare API token, once, for the account rather than for a server. The app checks it as you paste it, reads which account it opens and which zones it carries, and keeps it in your computer’s keychain. You copy no identifier by hand.",
        fr: "Un jeton d’API Cloudflare, une fois, pour le compte et non pour un serveur. L’app le vérifie à la seconde où vous le collez, lit le compte qu’il ouvre et les zones qu’il porte, et le garde dans le trousseau de votre ordinateur. Vous ne recopiez aucun identifiant.",
      },
      {
        en: "The domain this server publishes under, chosen among those zones. It is a per-server field: the account is shared, the domain is not.",
        fr: "Le domaine sous lequel ce serveur publie, choisi parmi ces zones. C’est un champ par serveur : le compte est commun, le domaine non.",
      },
    ],
    notes: {
      en: "Your token never leaves your computer: the app creates the tunnel and writes the DNS, and your server only ever receives what it needs to run that one tunnel — which is why the tunnel belongs to the server. A laptop you reinstall, or a colleague you hand the machine to, finds it again from the account token alone. A tunnel is an outbound connection: it opens no port on your server, and the firewall stays closed on everything but SSH.",
      fr: "Votre jeton ne quitte jamais votre ordinateur : l’app crée le tunnel et écrit le DNS, et votre serveur ne reçoit que de quoi faire tourner ce tunnel-là — c’est pourquoi le tunnel appartient au serveur. Un poste réinstallé, ou un collègue à qui vous confiez la machine, le retrouve avec le seul jeton du compte. Un tunnel est une connexion sortante : il n’ouvre aucun port sur votre serveur, et le pare-feu reste fermé sur tout sauf SSH.",
    },
  },
  "exposure.caddy": {
    installs: [
      {
        en: "Caddy from its own repository, as a reverse proxy with automatic Let’s Encrypt certificates.",
        fr: "Caddy depuis son propre dépôt, en reverse proxy avec certificats Let’s Encrypt automatiques.",
      },
      {
        en: "One site block per project that declares a subdomain, rewritten from the registry every time it changes.",
        fr: "Un bloc de site par projet qui déclare un sous-domaine, réécrit depuis le registre à chaque changement.",
      },
      {
        en: "The firewall rules its two ports need, under names of its own so hardening never takes them back.",
        fr: "Les règles de pare-feu dont ses deux ports ont besoin, sous des noms à lui pour que le durcissement ne les reprenne jamais.",
      },
    ],
    asks: [
      {
        en: "The domain the projects answer under. Its DNS record must already point at this server.",
        fr: "Le domaine sous lequel les projets répondent. Son enregistrement DNS doit déjà pointer sur ce serveur.",
      },
      {
        en: "The address Let’s Encrypt writes to about expiring certificates.",
        fr: "L’adresse à laquelle Let’s Encrypt écrit au sujet des certificats qui expirent.",
      },
      {
        en: "The HTTP and HTTPS ports. 80 and 443 unless something else already has them.",
        fr: "Les ports HTTP et HTTPS. 80 et 443, sauf si autre chose les occupe déjà.",
      },
    ],
    notes: {
      en: "This one does open ports 80 and 443. It is the only module that does. Uninstalling closes them again and leaves the certificates it obtained in place.",
      fr: "Celui-ci ouvre bien les ports 80 et 443. C’est le seul module qui le fasse. La désinstallation les referme et laisse en place les certificats obtenus.",
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
        en: "Nothing, once your GitHub account is connected. The token is given once, in the app, and kept in your computer’s keychain; each server you install this on takes it from there, over the SSH session, into a file only root can read.",
        fr: "Rien, une fois votre compte GitHub connecté. Le jeton est donné une seule fois, dans l’app, et gardé dans le trousseau de votre ordinateur ; chaque serveur où vous posez ce module le prend de là, par la session SSH, dans un fichier que seul root peut lire.",
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
        en: "Nothing, once your 1Password account is connected. The service account token is given once, in the app, scoped to the vaults you want the server to read.",
        fr: "Rien, une fois votre compte 1Password connecté. Le jeton de compte de service est donné une seule fois, dans l’app, limité aux coffres que le serveur doit lire.",
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
        en: "The Neon CLI on the machine, and the key you gave kept in the server’s environment file, readable by root alone.",
        fr: "Le CLI Neon sur la machine, et la clé que vous donnez rangée dans le fichier d’environnement du serveur, lisible par root seul.",
      },
      {
        en: "Nothing else: your projects, your branches and your databases stay yours to create.",
        fr: "Rien d’autre : vos projets, vos branches et vos bases restent les vôtres à créer.",
      },
    ],
    asks: [
      {
        en: "Nothing, once your Neon account is connected. The API key — personal or organisation — is given once, in the app.",
        fr: "Rien, une fois votre compte Neon connecté. La clé d’API — personnelle ou d’organisation — est donnée une seule fois, dans l’app.",
      },
    ],
    notes: {
      en: "The CLI has no token sign-in of its own: it reads a key from --api-key or NEON_API_KEY, so a shell that wants it has to be given it. Uninstalling takes back the CLI and the key it stored, and never touches your Neon account.",
      fr: "Le CLI n’a pas de connexion par jeton : il lit une clé dans --api-key ou NEON_API_KEY, donc un shell qui la veut doit la recevoir. La désinstallation reprend le CLI et la clé qu’il rangeait, et ne touche jamais à votre compte Neon.",
    },
  },
}
