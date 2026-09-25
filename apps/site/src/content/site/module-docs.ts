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
        en: "Base packages — curl, git, jq, tmux, zsh, unzip, build-essential, ufw, fail2ban — the time zone you pick, and unattended security updates that never reboot the machine on their own.",
        fr: "Les paquets de base — curl, git, jq, tmux, zsh, unzip, build-essential, ufw, fail2ban —, le fuseau que vous choisissez, et les mises à jour de sécurité automatiques qui ne redémarrent jamais la machine d’elles-mêmes.",
      },
      {
        en: "A swap file sized for the RAM — 2 GB, 4 GB above eight of memory — a memory guard, systemd-oomd or earlyoom, and raised inotify limits so a watcher does not run out of them mid-build.",
        fr: "Un fichier swap dimensionné pour la RAM — 2 Go, 4 Go au-delà de huit de mémoire —, un garde-fou mémoire, systemd-oomd ou earlyoom, et des limites inotify relevées pour qu’un watcher n’en manque pas en plein build.",
      },
      {
        en: "A dev user with sudo, whose authorized_keys receives the unrestricted keys already on root, so a key opens it before hardening closes root.",
        fr: "Un utilisateur dev avec sudo, dont authorized_keys reçoit les clés non restreintes déjà posées sur root, pour qu’une clé l’ouvre avant que la sécurisation ne ferme root.",
      },
      {
        en: "zsh as the login shell, a tmux configuration, and OSC 133 prompt markers in zsh and bash that let the app tell one command from the next.",
        fr: "zsh comme shell de connexion, une configuration tmux, et les marqueurs de prompt OSC 133 dans zsh et bash qui permettent à l’app de distinguer une commande de la suivante.",
      },
      {
        en: "The agent’s own systemd unit, and the dev command, linked to the agent binary, so the same operations exist in a plain SSH terminal.",
        fr: "L’unité systemd de l’agent, et la commande dev, liée au binaire de l’agent, pour que les mêmes opérations existent dans un terminal SSH ordinaire.",
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
      en: "This module is mandatory. Everything else assumes the dev user, the projects directory and the shells it sets up. Its shell block lives in .zshenv, which zsh reads for every shell — including the one an ssh command opens without logging in.",
      fr: "Ce module est obligatoire. Tout le reste suppose l’utilisateur dev, le dossier des projets et les shells qu’il installe. Son bloc de shell vit dans .zshenv, que zsh lit pour tous les shells — y compris celui qu’ouvre une commande ssh sans connexion.",
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
        fr: "fail2ban sur la jail SSH, avec les réglages par défaut d’Ubuntu.",
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
        fr: "S’il faut garder l’accès root. Décoché, root est fermé et dev devient la seule entrée ; coché, root reste joignable par clé SSH — jamais par mot de passe — et tout le reste de la sécurisation s’applique à l’identique.",
      },
    ],
    notes: {
      en: "This module is mandatory, and it is the one that can lock you out. It refuses to close root until a key has actually opened dev; if that check fails, nothing is closed and the app tells you why. An exposure module that needs ports 80 and 443 opens them under rules of its own, which this one never takes back.",
      fr: "Ce module est obligatoire, et c’est celui qui peut vous enfermer dehors. Il refuse de fermer root tant qu’une clé n’a pas réellement ouvert dev ; si cette vérification échoue, rien n’est fermé et l’app dit pourquoi. Un module d’exposition qui a besoin des ports 80 et 443 les ouvre sous des règles à lui, que celui-ci ne reprend jamais.",
    },
  },
  "core.backup": {
    installs: [
      {
        en: "Nothing but its settings: the agent itself dumps, archives, encrypts and sends, on the interval you set or when you ask.",
        fr: "Rien d’autre que ses réglages : l’agent lui-même exporte, archive, chiffre et envoie, à l’intervalle choisi ou quand vous le demandez.",
      },
      {
        en: "Each backup in your bucket: the configuration and secrets of the modules, the project list, every database, each project’s folder with its git history, the dev account’s SSH keys and coding-agent sessions, and the extra folders you name.",
        fr: "Chaque sauvegarde dans votre bucket : la configuration et les secrets des modules, la liste des projets, chaque base, le dossier de chaque projet avec son historique git, les clés SSH et les sessions des agents de code du compte dev, et les dossiers supplémentaires que vous nommez.",
      },
    ],
    asks: [
      {
        en: "Nothing about the bucket once the Backups page of the server has it: endpoint, bucket and keys come from there, with the public key backups are encrypted to.",
        fr: "Rien sur le bucket une fois qu’il est renseigné sur la page Sauvegardes du serveur : endpoint, bucket et clés en viennent, avec la clé publique pour laquelle les sauvegardes sont chiffrées.",
      },
      {
        en: "The interval in hours — 0 for on demand only — the hour a daily backup starts, and how many scheduled backups to keep.",
        fr: "L’intervalle en heures — 0 pour la demande seule —, l’heure où part une sauvegarde quotidienne, et combien de sauvegardes planifiées garder.",
      },
      {
        en: "What to include: databases, the dev account’s keys and sessions, projects whole or only their environment files, and extra folders.",
        fr: "Ce qu’il faut inclure : les bases, les clés et sessions du compte dev, les projets entiers ou leurs seuls fichiers d’environnement, et des dossiers supplémentaires.",
      },
    ],
    notes: {
      en: "The server encrypts and cannot decrypt: only your passphrase opens a backup, and nobody keeps it. A part that did not change since the last backup is copied inside the bucket instead of being sent again. Docker volumes are not backed up. See the Backups guide to set up the bucket and to restore.",
      fr: "Le serveur chiffre et ne peut pas déchiffrer : seule votre passphrase ouvre une sauvegarde, et personne ne la garde. Une partie inchangée depuis la dernière sauvegarde est copiée dans le bucket au lieu d’être renvoyée. Les volumes Docker ne sont pas sauvegardés. Le guide Sauvegardes dit comment régler le bucket et restaurer.",
    },
  },
  "runtime.node": {
    installs: [
      {
        en: "mise, as the version manager.",
        fr: "mise, comme gestionnaire de versions.",
      },
      {
        en: "Node at the version you choose, plus Bun, pnpm and Yarn if you want them; pnpm and Yarn come through corepack, so a repository that pins its own version keeps it.",
        fr: "Node à la version choisie, et Bun, pnpm et Yarn si vous les voulez ; pnpm et Yarn passent par corepack, pour qu’un dépôt qui épingle sa propre version la garde.",
      },
      {
        en: "A marked block in .zshenv that puts the shims and ~/.local/bin on the path of every shell, including the non-interactive ones an agent uses.",
        fr: "Un bloc balisé dans .zshenv qui place les shims et ~/.local/bin sur le PATH de tous les shells, y compris les non interactifs qu’utilise un agent.",
      },
    ],
    asks: [
      { en: "The Node version.", fr: "La version de Node." },
      { en: "Bun, yes or no.", fr: "Bun, oui ou non." },
      { en: "pnpm, yes or no.", fr: "pnpm, oui ou non." },
      {
        en: "Yarn, yes or no. Off by default: few recent repositories still ask for it.",
        fr: "Yarn, oui ou non. Décoché par défaut : peu de dépôts récents le réclament encore.",
      },
    ],
    notes: {
      en: "The non-interactive activation is the point: an agent that runs npm through ssh without a login shell finds the same versions you do. It is also what puts codex on the path of a remote client. Any other Node version is one mise command away in a terminal, and the same gesture covers Java, Python, Go, PHP and Ruby.",
      fr: "L’activation non interactive est l’essentiel : un agent qui lance npm par ssh sans shell de connexion trouve les mêmes versions que vous. C’est aussi ce qui met codex sur le PATH d’un client distant. Toute autre version de Node s’installe par une commande mise dans un terminal, et le même geste vaut pour Java, Python, Go, PHP et Ruby.",
    },
  },
  "runtime.java": {
    installs: [
      { en: "Temurin through mise.", fr: "Temurin via mise." },
      {
        en: "JAVA_HOME in every shell, and a Gradle daemon sized for the RAM the machine actually has.",
        fr: "JAVA_HOME dans tous les shells, et un daemon Gradle dimensionné pour la RAM dont la machine dispose réellement.",
      },
    ],
    asks: [{ en: "The Java version.", fr: "La version de Java." }],
  },
  "runtime.python": {
    installs: [
      {
        en: "uv, and one Python version, both through mise.",
        fr: "uv, et une version de Python, tous deux via mise.",
      },
      {
        en: "The base every Python agent on the machine builds on, Hermes included.",
        fr: "La base sur laquelle s’appuie tout agent Python de la machine, Hermes compris.",
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
      fr: "PHP est compilé depuis les sources : la première installation est la longue, plusieurs minutes. La relancer ensuite ne change rien et prend quelques secondes.",
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
  "runtime.rust": {
    installs: [
      {
        en: "Rust at the chosen version through mise, which installs rustup and the toolchain and answers for cargo, rustc and rustup through its shims.",
        fr: "Rust à la version choisie par mise, qui pose rustup et la toolchain et répond pour cargo, rustc et rustup par ses shims.",
      },
      {
        en: "~/.cargo/bin on the path of every shell, so what cargo install builds is found like anything else.",
        fr: "~/.cargo/bin sur le PATH de tous les shells, pour que ce que cargo install construit se trouve comme le reste.",
      },
    ],
    asks: [{ en: "The version.", fr: "La version." }],
    notes: {
      en: "Any other version is one mise command away in a terminal. Uninstalling takes back the toolchain and the path; the registry cache and the binaries cargo install built stay.",
      fr: "Toute autre version s’installe par une commande mise dans un terminal. La désinstallation reprend la toolchain et le PATH ; le cache du registre et les binaires que cargo install a construits restent.",
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
        fr: "Une configuration du daemon qui fait tourner les logs des conteneurs au lieu de les laisser remplir le disque.",
      },
      {
        en: "Published ports bound to 127.0.0.1 on the default bridge and on every network docker network create or Compose makes: -p 5432:5432 answers on the server and through the SSH session, not on the internet, over IPv4 or IPv6.",
        fr: "Les ports publiés liés à 127.0.0.1 sur le pont par défaut et sur chaque réseau que docker network create ou Compose crée : -p 5432:5432 répond sur le serveur et à travers la session SSH, pas sur Internet, ni en IPv4 ni en IPv6.",
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
      en: "The daemon listens on its socket and on nothing else. Docker’s rules come before the firewall’s, so a port published on every address would be open whatever ufw says: to put a container on the web, route a project’s subdomain to its port through Caddy or the tunnel. To publish one directly anyway, name the address — -p 0.0.0.0:8080:80, or 0.0.0.0:8080:80 under ports in a compose file — knowing ufw will not filter it. On a server that ran containers before this setting, dockerd keeps its default bridge while a container runs, each network keeps the options it was created with, and each container its ports: the install names the ones still open on every address, and closing them takes stopping the containers, sudo systemctl restart docker, then docker compose down && docker compose up -d in each project and docker network rm then create for a network made by hand. With nothing running, the install restarts the daemon itself. Uninstalling takes back the engine and leaves your images, volumes and containers where they are.",
      fr: "Le daemon écoute sur sa socket et sur rien d’autre. Les règles de Docker passent avant celles du pare-feu : un port publié sur toutes les adresses serait ouvert quoi qu’en dise ufw. Pour mettre un conteneur sur le web, routez le sous-domaine d’un projet vers son port par Caddy ou le tunnel. Pour en publier un directement malgré tout, nommez l’adresse — -p 0.0.0.0:8080:80, ou 0.0.0.0:8080:80 sous ports dans un fichier compose — en sachant qu’ufw ne le filtrera pas. Sur un serveur qui faisait tourner des conteneurs avant ce réglage, dockerd garde son pont par défaut tant qu’un conteneur tourne, chaque réseau garde les options de sa création et chaque conteneur ses ports : l’installation nomme ceux qui restent ouverts sur toutes les adresses, et les fermer demande d’arrêter les conteneurs, sudo systemctl restart docker, puis docker compose down && docker compose up -d dans chaque projet et docker network rm puis create pour un réseau créé à la main. Quand rien ne tourne, l’installation relance le daemon elle-même. La désinstallation reprend le moteur et laisse vos images, volumes et conteneurs là où ils sont.",
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
        fr: "Root sur la socket, un compte applicatif, et un compte distant séparé que votre poste utilise à travers la session SSH.",
      },
      {
        en: "A buffer pool sized for the machine, and an import of any dump you drop in ~/dumps — once each, whatever the engine.",
        fr: "Un buffer pool dimensionné pour la machine, et l’import de tout dump déposé dans ~/dumps — une fois chacun, quel que soit le moteur.",
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
      en: "Nothing listens on a public interface. A database client on your laptop reaches the server through a tunnel the app opens on the SSH session it already holds — one click on the service page.",
      fr: "Rien n’écoute sur une interface publique. Un client de base sur votre poste atteint le serveur par un tunnel que l’app ouvre sur la session SSH qu’elle tient déjà — un clic sur la page du service.",
    },
  },
  "db.postgres": {
    installs: [
      {
        en: "PostgreSQL at the major version you pick, from the project’s own repository, listening on 127.0.0.1 only.",
        fr: "PostgreSQL à la version majeure choisie, depuis le dépôt du projet, en écoute sur 127.0.0.1 uniquement.",
      },
      {
        en: "An application role that owns the imported databases, a remote role for your laptop, and the pg_trgm, uuid-ossp and citext extensions.",
        fr: "Un rôle applicatif qui possède les bases importées, un rôle distant pour votre poste, et les extensions pg_trgm, uuid-ossp et citext.",
      },
      {
        en: "Shared buffers sized for the machine, unless you give a size of your own.",
        fr: "Une mémoire partagée dimensionnée pour la machine, sauf si vous donnez une taille à vous.",
      },
      {
        en: "An import of the dumps you drop in ~/dumps.",
        fr: "L’import des dumps que vous déposez dans ~/dumps.",
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
      {
        en: "The shared buffers size.",
        fr: "La taille de la mémoire partagée.",
      },
    ],
    notes: {
      en: "Uninstalling takes back the packages and the configuration. The cluster’s data directory stays where PostgreSQL wrote it.",
      fr: "La désinstallation reprend les paquets et la configuration. Le dossier de données du cluster reste là où PostgreSQL l’a écrit.",
    },
  },
  "db.mongodb": {
    installs: [
      {
        en: "MongoDB at the major version you pick, bound to 127.0.0.1, with authentication on.",
        fr: "MongoDB à la version majeure choisie, lié à 127.0.0.1, authentification active.",
      },
      { en: "An application user.", fr: "Un utilisateur applicatif." },
      {
        en: "A WiredTiger cache sized for the machine — a quarter of its memory, where MongoDB left alone would take half.",
        fr: "Un cache WiredTiger dimensionné pour la machine — un quart de sa mémoire, là où MongoDB laissé seul en prendrait la moitié.",
      },
      {
        en: "An import of the mongodump archives you drop in ~/dumps.",
        fr: "L’import des archives mongodump que vous déposez dans ~/dumps.",
      },
    ],
    asks: [
      {
        en: "The major version. 7.0 exists for Ubuntu 22.04 only; on 24.04 MongoDB publishes 8.0 alone, and 7.0 is refused before anything is installed.",
        fr: "La version majeure. La 7.0 n’existe que pour Ubuntu 22.04 ; sur 24.04 MongoDB ne publie que la 8.0, et la 7.0 est refusée avant toute installation.",
      },
      { en: "The port. 27017 by default.", fr: "Le port. 27017 par défaut." },
      {
        en: "The name of the application user.",
        fr: "Le nom de l’utilisateur applicatif.",
      },
      { en: "The application password.", fr: "Le mot de passe applicatif." },
      {
        en: "The cache size in megabytes. Zero follows the machine.",
        fr: "La taille du cache en mégaoctets. Zéro suit la machine.",
      },
    ],
  },
  "db.mailpit": {
    installs: [
      {
        en: "Mailpit as the static binary of its GitHub release, for this architecture, refused unless its digest is the one GitHub publishes for the asset, then placed under /usr/local/bin.",
        fr: "Mailpit sous la forme du binaire statique de sa release GitHub, pour cette architecture, refusé si son checksum n’est pas celui que GitHub publie pour l’artefact, puis posé sous /usr/local/bin.",
      },
      {
        en: "A systemd service under the dev account, SMTP on 127.0.0.1:1025 and the interface on 127.0.0.1:8025 by default, the messages in a SQLite file under dev’s home.",
        fr: "Un service systemd sous le compte dev, SMTP sur 127.0.0.1:1025 et l’interface sur 127.0.0.1:8025 par défaut, les messages dans un fichier SQLite dans le home de dev.",
      },
    ],
    asks: [
      {
        en: "The two ports, when the defaults are taken on this machine.",
        fr: "Les deux ports, quand ceux par défaut sont pris sur cette machine.",
      },
    ],
    notes: {
      en: "Point your projects’ mail configuration at the SMTP port and nothing leaves the machine: every message lands in the interface, which the app reaches through its own port forward. Uninstalling takes back the binary and the service; the messages it caught stay under dev’s home.",
      fr: "Pointez la configuration de courrier de vos projets sur le port SMTP et rien ne quitte la machine : chaque message atterrit dans l’interface, que l’app joint par son propre transfert de port. La désinstallation reprend le binaire et le service ; les messages capturés restent dans le home de dev.",
    },
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
      {
        en: "What gets evicted once the ceiling is reached. Without a ceiling, nothing is.",
        fr: "Ce qui est évincé une fois le plafond atteint. Sans plafond, rien ne l’est.",
      },
    ],
    notes: {
      en: "The install ends by checking that the password actually opens the server, rather than assuming it. Uninstalling takes back the package and the configuration; what Redis wrote under /var/lib/redis stays.",
      fr: "L’installation se termine en vérifiant que le mot de passe ouvre réellement le serveur, plutôt que de le supposer. La désinstallation reprend le paquet et la configuration ; ce que Redis a écrit sous /var/lib/redis reste.",
    },
  },
  "ai.claude": {
    installs: [
      {
        en: "Claude Code as the native binary Anthropic publishes, downloaded for this architecture and refused unless its checksum matches the one the release manifest announces.",
        fr: "Claude Code sous la forme du binaire natif publié par Anthropic, téléchargé pour cette architecture et refusé si son checksum ne correspond pas à celui qu’annonce le manifeste de la version.",
      },
      {
        en: "The machine context in ~/.claude/CLAUDE.md: this is a Linux server and not a workstation, where the projects live, and that servers are driven with the dev command rather than started by hand.",
        fr: "Le contexte machine dans ~/.claude/CLAUDE.md : cette machine est un serveur Linux et non un poste de travail, où vivent les projets, et que les serveurs se pilotent avec la commande dev plutôt qu’en les lançant à la main.",
      },
      {
        en: "The Pupitre skills — server-dev, capture, branch, pr, ship — in ~/.agents/skills and in the tool’s own folder, plus the git-shipper subagent.",
        fr: "Les skills Pupitre — server-dev, capture, branch, pr, ship — dans ~/.agents/skills et dans le dossier propre à l’outil, ainsi que le sous-agent git-shipper.",
      },
    ],
    asks: [],
    notes: {
      en: "Your own subscription. Pupitre resells nothing and stores no token for you: the tool prints its sign-in URL on first run, you approve it in your browser, and the credentials stay on the server. Uninstalling takes back the binary and the context this module wrote; the conversations, the credentials and the skills you added yourself stay. You can also skip Pupitre’s terminal entirely and attach the Claude desktop app to the server over SSH, with the key the app generated.",
      fr: "Votre propre abonnement. Pupitre ne revend rien et ne stocke aucun token pour vous : l’outil affiche son URL de connexion au premier lancement, vous l’approuvez dans votre navigateur, et les identifiants restent sur le serveur. La désinstallation reprend le binaire et le contexte que ce module a écrit ; les conversations, les identifiants et les skills que vous avez ajoutés restent. Vous pouvez aussi vous passer du terminal de Pupitre et brancher l’app Claude sur le serveur en SSH, avec la clé que l’app a générée.",
    },
  },
  "ai.codex": {
    installs: [
      {
        en: "Codex through mise, which pins and upgrades it the way it does a runtime and puts it on the path of every shell — including the non-interactive one a remote client opens.",
        fr: "Codex via mise, qui l’épingle et le met à jour comme un runtime et le place sur le PATH de tous les shells — y compris le shell non interactif qu’ouvre un client distant.",
      },
      {
        en: "The same machine context, in ~/.codex/AGENTS.md, and the same Pupitre skills.",
        fr: "Le même contexte machine, dans ~/.codex/AGENTS.md, et les mêmes skills Pupitre.",
      },
    ],
    asks: [],
    notes: {
      en: "Your own subscription, again, and the same sign-in through a URL printed on first run. Claude Code and Codex can live on the same machine: they see the same projects, the same runtimes and the same databases, because there is only one machine. In the ChatGPT desktop app, Codex adds a remote project from a host alias of your ~/.ssh/config, so a Pupitre server reaches it through one host entry.",
      fr: "Votre propre abonnement, là encore, et la même connexion par une URL affichée au premier lancement. Claude Code et Codex peuvent cohabiter sur la même machine : ils voient les mêmes projets, les mêmes runtimes et les mêmes bases, parce qu’il n’y a qu’une machine. Dans l’app ChatGPT, Codex ajoute un projet distant depuis un alias d’hôte de votre ~/.ssh/config : un serveur Pupitre s’y branche par une entrée d’hôte.",
    },
  },
  "ai.cursor": {
    installs: [
      {
        en: "The Cursor CLI as Cursor’s own installer lays it down: the package for this architecture under ~/.local/share/cursor-agent/versions, and the agent and cursor-agent commands linked from ~/.local/bin. The version is the one the installer names at that moment; nothing in the installer runs.",
        fr: "Le CLI de Cursor tel que l’installeur de Cursor le pose : le paquet de cette architecture sous ~/.local/share/cursor-agent/versions, et les commandes agent et cursor-agent liées depuis ~/.local/bin. La version est celle que l’installeur nomme à ce moment ; rien de l’installeur ne s’exécute.",
      },
      {
        en: "The Pupitre skills in ~/.cursor/skills and ~/.agents/skills, both of which Cursor reads. No machine context file: Cursor keeps its user rules in your account rather than on disk, so the skills carry what the machine has to say.",
        fr: "Les skills Pupitre dans ~/.cursor/skills et ~/.agents/skills, que Cursor lit tous deux. Pas de fichier de contexte machine : Cursor garde vos règles dans votre compte plutôt que sur le disque, et ce sont les skills qui portent ce que la machine a à dire.",
      },
    ],
    asks: [],
    notes: {
      en: "Your own Cursor subscription. Sign in from a terminal on the server with NO_OPEN_BROWSER=1 cursor-agent login: the URL it prints opens in your browser, and the app turns it into a button when Cursor prints it in one of its terminals. Cursor publishes no checksum beside its package, so the transport is the only guarantee, and the download stays root’s until it is in place. Uninstalling takes back the package and the links; ~/.cursor, with your credentials and conversations, stays.",
      fr: "Votre propre abonnement Cursor. La connexion se fait depuis un terminal sur le serveur avec NO_OPEN_BROWSER=1 cursor-agent login : l’URL affichée s’ouvre dans votre navigateur, et l’app en fait un bouton quand Cursor l’affiche dans un de ses terminaux. Cursor ne publie aucun checksum à côté de son paquet : le transport est la seule garantie, et le téléchargement reste à root jusqu’à sa mise en place. La désinstallation reprend le paquet et les liens ; ~/.cursor, avec vos identifiants et vos conversations, reste.",
    },
  },
  "ai.gemini": {
    installs: [
      {
        en: "Gemini CLI through mise, which pins and upgrades it the way it does a runtime and puts it on the path of every shell.",
        fr: "Gemini CLI via mise, qui l’épingle et le met à jour comme un runtime et le place sur le PATH de tous les shells.",
      },
      {
        en: "The machine context in ~/.gemini/GEMINI.md and the Pupitre skills in ~/.gemini/skills and ~/.agents/skills, both of which Gemini reads.",
        fr: "Le contexte machine dans ~/.gemini/GEMINI.md et les skills Pupitre dans ~/.gemini/skills et ~/.agents/skills, que Gemini lit tous deux.",
      },
    ],
    asks: [],
    notes: {
      en: "Your Google account, or a Gemini API key. On a server, sign in from a terminal with NO_BROWSER=true gemini: it prints the URL, you approve in your browser, and you paste the code it gives back. The free tier of a personal Google account is enough to work, which makes Gemini the agent to try before paying for anything. Gemini CLI has no command that says who holds the session, so the dashboard shows no account for it. Uninstalling takes back the CLI and the context this module wrote; ~/.gemini, with your credentials and settings, stays.",
      fr: "Votre compte Google, ou une clé d’API Gemini. Sur un serveur, la connexion se fait depuis un terminal avec NO_BROWSER=true gemini : il affiche l’URL, vous approuvez dans votre navigateur, et vous collez le code rendu. Le niveau gratuit d’un compte Google personnel suffit pour travailler, ce qui fait de Gemini l’agent à essayer avant de payer quoi que ce soit. Gemini CLI n’a pas de commande qui dise qui tient la session : le tableau de bord n’affiche donc aucun compte pour lui. La désinstallation reprend le CLI et le contexte que ce module a écrit ; ~/.gemini, avec vos identifiants et vos réglages, reste.",
    },
  },
  "ai.copilot": {
    installs: [
      {
        en: "The GitHub Copilot CLI through mise, which pins and upgrades it the way it does a runtime and puts it on the path of every shell.",
        fr: "Le CLI de GitHub Copilot via mise, qui l’épingle et le met à jour comme un runtime et le place sur le PATH de tous les shells.",
      },
      {
        en: "The machine context in ~/.copilot/copilot-instructions.md and the Pupitre skills in ~/.copilot/skills and ~/.agents/skills.",
        fr: "Le contexte machine dans ~/.copilot/copilot-instructions.md et les skills Pupitre dans ~/.copilot/skills et ~/.agents/skills.",
      },
    ],
    asks: [],
    notes: {
      en: "Your own Copilot subscription. On a server, copilot login uses the device code: it prints a code and the page to enter it on, and the app turns that page into a button. A token in COPILOT_GITHUB_TOKEN, GH_TOKEN or GITHUB_TOKEN works too. The CLI has no command that says who holds the session, so the dashboard shows no account for it. Uninstalling takes back the CLI and the context this module wrote; ~/.copilot, with your credentials and sessions, stays.",
      fr: "Votre propre abonnement Copilot. Sur un serveur, copilot login passe par le code d’appareil : il affiche un code et la page où l’entrer, et l’app fait de cette page un bouton. Un token dans COPILOT_GITHUB_TOKEN, GH_TOKEN ou GITHUB_TOKEN marche aussi. Le CLI n’a pas de commande qui dise qui tient la session : le tableau de bord n’affiche donc aucun compte pour lui. La désinstallation reprend le CLI et le contexte que ce module a écrit ; ~/.copilot, avec vos identifiants et vos sessions, reste.",
    },
  },
  "ai.opencode": {
    installs: [
      {
        en: "OpenCode as the static binary of its GitHub release, for this architecture — the baseline build on an x64 machine without AVX2 — refused unless its SHA-256 is the one GitHub publishes for the asset, then placed in ~/.local/bin.",
        fr: "OpenCode sous la forme du binaire statique de sa release GitHub, pour cette architecture — la variante baseline sur une machine x64 sans AVX2 — refusé si son checksum SHA-256 n’est pas celui que GitHub publie pour l’artefact, puis posé dans ~/.local/bin.",
      },
      {
        en: "The machine context in ~/.config/opencode/AGENTS.md and the Pupitre skills in ~/.config/opencode/skills and ~/.agents/skills.",
        fr: "Le contexte machine dans ~/.config/opencode/AGENTS.md et les skills Pupitre dans ~/.config/opencode/skills et ~/.agents/skills.",
      },
    ],
    asks: [],
    notes: {
      en: "OpenCode is open source and tied to no provider: it starts on the free models it ships with, and opencode auth login connects the account you already pay for — Claude, ChatGPT, GitHub Copilot — or the key of any of the providers it knows. The dashboard names the providers it holds a credential for. Uninstalling takes back the binary and the context this module wrote; ~/.local/share/opencode, with your credentials and sessions, stays.",
      fr: "OpenCode est open source et n’impose aucun fournisseur : il démarre sur les modèles gratuits qu’il embarque, et opencode auth login branche le compte que vous payez déjà — Claude, ChatGPT, GitHub Copilot — ou la clé d’un des fournisseurs qu’il connaît. Le tableau de bord nomme les fournisseurs pour lesquels il tient un identifiant. La désinstallation reprend le binaire et le contexte que ce module a écrit ; ~/.local/share/opencode, avec vos identifiants et vos sessions, reste.",
    },
  },
  "ai.hermes": {
    installs: [
      {
        en: "Hermes Agent, from Nous Research, on the Python runtime.",
        fr: "Hermes Agent, de Nous Research, sur le runtime Python.",
      },
      {
        en: "The model providers you configure, the same machine context and skills as the other agents, and a systemd service if you want it always on.",
        fr: "Les fournisseurs de modèles que vous configurez, le même contexte machine et les mêmes skills que les autres agents, et un service systemd si vous le voulez toujours actif.",
      },
    ],
    asks: [
      {
        en: "One key per model provider, as provider:key. They are written to a file only root can read.",
        fr: "Une clé par fournisseur de modèles, sous la forme fournisseur:clé. Elles sont écrites dans un fichier que seul root peut lire.",
      },
      { en: "Always on, yes or no.", fr: "Toujours actif, oui ou non." },
    ],
    notes: {
      en: "This one is not signed in through a subscription: it talks to the providers whose keys you gave, and those keys stay on the machine.",
      fr: "Celui-ci ne se connecte pas par un abonnement : il parle aux fournisseurs dont vous avez donné les clés, et ces clés restent sur la machine.",
    },
  },
  "ai.openclaw": {
    installs: [
      {
        en: "OpenClaw through mise on the machine’s Node — 24.16 or later, which the install checks before spending a minute on it — on the path of every shell.",
        fr: "OpenClaw via mise sur le Node de la machine — 24.16 ou plus récent, ce que l’installation vérifie avant d’y passer une minute — sur le PATH de tous les shells.",
      },
      {
        en: "The model providers you give, as the variables the gateway reads (ANTHROPIC_API_KEY, OPENAI_API_KEY…) in a file only dev can read, and the gateway as a systemd service on 127.0.0.1:18789 when always on.",
        fr: "Les fournisseurs de modèles que vous donnez, sous les variables que la gateway lit (ANTHROPIC_API_KEY, OPENAI_API_KEY…) dans un fichier que seul dev peut lire, et la gateway en service systemd sur 127.0.0.1:18789 quand elle est toujours active.",
      },
      {
        en: "The Pupitre skills in ~/.openclaw/skills and ~/.agents/skills, both of which OpenClaw reads. No machine context file: OpenClaw writes its own AGENTS.md in the workspace it bootstraps.",
        fr: "Les skills Pupitre dans ~/.openclaw/skills et ~/.agents/skills, qu’OpenClaw lit tous deux. Pas de fichier de contexte machine : OpenClaw écrit son propre AGENTS.md dans l’espace de travail qu’il crée.",
      },
    ],
    asks: [
      {
        en: "One line per provider, as name:key, and whether the gateway stays up between two sessions.",
        fr: "Une ligne par fournisseur, sous la forme nom:clé, et si la gateway reste en marche entre deux sessions.",
      },
    ],
    notes: {
      en: "The channels — Telegram, Discord, WhatsApp — are wired with openclaw onboard in a terminal on the server: the wizard asks for the bot tokens and writes ~/.openclaw/openclaw.json, which the module never touches. Node 24, the default of the Node.js module, is what it needs: a machine set to Node 22 or 20 has to move to 24 first, and the install says so before doing anything. Uninstalling takes back the CLI, the providers and the service; the workspace, the sessions and the channels stay under ~/.openclaw.",
      fr: "Les canaux — Telegram, Discord, WhatsApp — se branchent par openclaw onboard dans un terminal sur le serveur : l’assistant demande les tokens des bots et écrit ~/.openclaw/openclaw.json, que le module ne touche jamais. Node 24, le défaut du module Node.js, est ce qu’il lui faut : une machine réglée sur Node 22 ou 20 doit passer à 24 d’abord, et l’installation le dit avant de rien faire. La désinstallation reprend le CLI, les fournisseurs et le service ; l’espace de travail, les sessions et les canaux restent sous ~/.openclaw.",
    },
  },
  "ai.browser": {
    installs: [
      {
        en: "Google Chrome on amd64, the distribution’s Chromium elsewhere, and the libraries Playwright needs that Ubuntu does not ship.",
        fr: "Google Chrome sur amd64, le Chromium de la distribution ailleurs, et les bibliothèques dont Playwright a besoin et qu’Ubuntu ne fournit pas.",
      },
      {
        en: "The shot command, linked to the agent binary: it captures a page or files an image under ~/shots, in a folder per day, desktop or mobile viewport.",
        fr: "La commande shot, liée au binaire de l’agent : elle capture une page ou range une image sous ~/shots, dans un dossier par jour, en fenêtre bureau ou mobile.",
      },
      {
        en: "A read-only gallery served on the loopback alone, as a systemd unit, so a capture has a URL an agent can hand back instead of a local path nobody else can open.",
        fr: "Une galerie en lecture seule servie sur localhost uniquement, en unité systemd, pour qu’une capture ait une URL qu’un agent peut rendre plutôt qu’un chemin local que personne d’autre ne peut ouvrir.",
      },
    ],
    asks: [],
    notes: {
      en: "This is what lets an agent look at the page it just changed instead of guessing. The gallery answers on 127.0.0.1 and nowhere else: the app reaches it through the SSH session it already holds, and no port is opened on the server.",
      fr: "C’est ce qui permet à un agent de regarder la page qu’il vient de modifier au lieu de la deviner. La galerie répond sur 127.0.0.1 et nulle part ailleurs : l’app l’atteint par la session SSH qu’elle tient déjà, et aucun port n’est ouvert sur le serveur.",
    },
  },
  "editor.jetbrains": {
    installs: [
      {
        en: "The remote development backend for the IDE you choose, in the cache JetBrains Gateway inspects, so the first connection is not a ten-minute download.",
        fr: "Le backend de développement distant de l’IDE choisi, dans le cache qu’inspecte JetBrains Gateway, pour que la première connexion ne soit pas un téléchargement de dix minutes.",
      },
      {
        en: "A JVM and a heap sized for the RAM the machine has.",
        fr: "Une JVM et un heap dimensionnés pour la RAM de la machine.",
      },
    ],
    asks: [
      {
        en: "Which IDE: IntelliJ IDEA, WebStorm, PyCharm, PhpStorm or GoLand.",
        fr: "Quel IDE : IntelliJ IDEA, WebStorm, PyCharm, PhpStorm ou GoLand.",
      },
      {
        en: "The version — latest, or a major version such as 2026.2 — which has to stay compatible with your Gateway.",
        fr: "La version — latest, ou une version majeure comme 2026.2 — qui doit rester compatible avec votre Gateway.",
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
        en: "The code CLI and the remote server for the release it names, preinstalled so the first Remote SSH connection is immediate.",
        fr: "La CLI code et le serveur distant de la version qu’elle désigne, préinstallés pour que la première connexion Remote SSH soit immédiate.",
      },
      {
        en: "The extensions you list, and a Remote Tunnel as a systemd service if you ask for one.",
        fr: "Les extensions que vous listez, et un Remote Tunnel en service systemd si vous en demandez un.",
      },
      {
        en: "The same ground for Cursor and Windsurf, which lay their own server the same way.",
        fr: "Le même terrain pour Cursor et Windsurf, qui posent leur propre serveur de la même façon.",
      },
    ],
    asks: [
      {
        en: "The extensions to preinstall, one identifier per line.",
        fr: "Les extensions à préinstaller, un identifiant par ligne.",
      },
      { en: "Remote Tunnel, yes or no.", fr: "Remote Tunnel, oui ou non." },
    ],
    notes: {
      en: "The tunnel asks for one sign-in once installed; Remote SSH asks for nothing beyond the key you already use. Visual Studio has no Linux backend: if you ask for it the app says so and points you here.",
      fr: "Le tunnel demande une authentification une fois posé ; Remote SSH ne demande rien de plus que la clé que vous utilisez déjà. Visual Studio n’a pas de backend Linux : si vous le demandez, l’app le dit et vous renvoie ici.",
    },
  },
  "editor.zed": {
    installs: [
      {
        en: "The Zed remote server for the version you name, where Zed looks for it before uploading or downloading one, so a zed://ssh link opens straight away.",
        fr: "Le serveur distant de Zed pour la version indiquée, là où Zed le cherche avant d’en envoyer ou d’en télécharger un, pour qu’un lien zed://ssh ouvre immédiatement.",
      },
    ],
    asks: [
      {
        en: "The version. latest, or the exact version of your Zed: the remote server has to match the client.",
        fr: "La version. latest, ou la version exacte de votre Zed : le serveur distant doit correspondre au client.",
      },
    ],
    notes: {
      en: "Uninstalling takes back the server this module downloaded, and only that one: another version you put there yourself is not ours to remove.",
      fr: "La désinstallation reprend le serveur que ce module a téléchargé, et lui seul : une autre version que vous avez posée vous-même n’est pas à nous de la retirer.",
    },
  },
  "exposure.cloudflare": {
    installs: [
      {
        en: "cloudflared as a systemd service, running one tunnel for the machine, with one ingress rule per project that declares a subdomain.",
        fr: "cloudflared en service systemd, faisant tourner un tunnel pour la machine, avec une règle d’ingress par projet qui déclare un sous-domaine.",
      },
      {
        en: "The DNS record and the certificate, managed for you by Cloudflare, on a subdomain taken from the project registry.",
        fr: "L’enregistrement DNS et le certificat, gérés pour vous par Cloudflare, sur un sous-domaine tiré du registre des projets.",
      },
      {
        en: "A marker saying this module holds the machine’s exposure, and a check that the tunnel really came up before the install is called done.",
        fr: "Un marqueur disant que ce module tient l’exposition de la machine, et une vérification que le tunnel est réellement monté avant de déclarer l’installation faite.",
      },
    ],
    asks: [
      {
        en: "A Cloudflare API token, once, for the account rather than for a server. The app checks it as you paste it, reads which account it opens and which zones it carries, and keeps it in your computer’s keychain. You copy no identifier by hand.",
        fr: "Un token d’API Cloudflare, une fois, pour le compte et non pour un serveur. L’app le vérifie à la seconde où vous le collez, lit le compte qu’il ouvre et les zones qu’il porte, et le garde dans le trousseau de votre ordinateur. Vous ne recopiez aucun identifiant.",
      },
      {
        en: "The domain this server publishes under, chosen among those zones. It is a per-server field: the account is shared, the domain is not.",
        fr: "Le domaine sous lequel ce serveur publie, choisi parmi ces zones. C’est un champ par serveur : le compte est commun, le domaine non.",
      },
    ],
    notes: {
      en: "Your token never leaves your computer: the app creates the tunnel and writes the DNS, and your server only ever receives what it needs to run that one tunnel. A tunnel is an outbound connection: it opens no port on your server, and the firewall stays closed on everything but SSH. This module and Caddy contradict each other — a machine has one exposure, or none.",
      fr: "Votre token ne quitte jamais votre ordinateur : l’app crée le tunnel et écrit le DNS, et votre serveur ne reçoit que de quoi faire tourner ce tunnel-là. Un tunnel est une connexion sortante : il n’ouvre aucun port sur votre serveur, et le pare-feu reste fermé sur tout sauf SSH. Ce module et Caddy se contredisent — une machine a une exposition, ou aucune.",
    },
  },
  "exposure.tailscale": {
    installs: [
      {
        en: "Tailscale from the vendor’s own apt repository, key first, then the node joined to your tailnet with the auth key you give — on the command line tailscale takes it, replaced by [secret] in the journal.",
        fr: "Tailscale depuis le dépôt apt de l’éditeur, clé d’abord, puis le nœud joint à votre tailnet avec la clé d’authentification que vous donnez — sur la ligne de commande que tailscale attend, remplacée par [secret] dans les logs.",
      },
      {
        en: "A ufw rule that lets the tailnet interface in, so SSH and the projects’ ports answer over Tailscale once the hardening has closed everything else.",
        fr: "Une règle ufw qui laisse entrer l’interface du tailnet, pour que SSH et les ports des projets répondent par Tailscale une fois que la sécurisation a fermé tout le reste.",
      },
    ],
    asks: [
      {
        en: "An auth key minted in the Tailscale admin console, the name the machine takes on the tailnet if not its hostname, and whether Tailscale SSH opens the machine to tailnet members by their identity.",
        fr: "Une clé d’authentification créée dans la console d’administration Tailscale, le nom que la machine prend sur le tailnet s’il diffère de son nom d’hôte, et si Tailscale SSH ouvre la machine aux membres du tailnet par leur identité.",
      },
    ],
    notes: {
      en: "The key is typed, not held by the app: it is minted for one machine and opens nothing from the laptop. The machine then keeps its own node key, and the dashboard says under which login it sits. Tailscale lives beside Caddy or the tunnel: it is the private way in, they are the public one. Tailscale SSH is off by default: it answers before sshd, so neither AllowUsers, nor root being closed, nor fail2ban applies to it, and only your tailnet’s access policy decides who gets in and as which account, root included. Uninstalling logs the node out of the tailnet before taking the package, the rule and the repository back.",
      fr: "La clé est tapée, pas tenue par l’app : elle est créée pour une machine et n’ouvre rien depuis le portable. La machine garde ensuite sa propre clé de nœud, et le tableau de bord dit sous quel login elle est. Tailscale cohabite avec Caddy ou le tunnel : c’est l’entrée privée, eux sont l’entrée publique. Tailscale SSH est désactivé par défaut : il répond avant sshd, donc ni AllowUsers, ni la fermeture de root, ni fail2ban ne s’y appliquent, et seule la politique d’accès de votre tailnet décide qui entre et sous quel compte, root compris. La désinstallation déconnecte le nœud du tailnet avant de reprendre le paquet, la règle et le dépôt.",
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
        fr: "Les règles de pare-feu dont ses deux ports ont besoin, sous des noms à lui pour que la sécurisation ne les reprenne jamais.",
      },
    ],
    asks: [
      {
        en: "The domain the projects answer under. Its A record, and the wildcard beside it, must already point at this server: Let’s Encrypt checks that path before issuing anything.",
        fr: "Le domaine sous lequel les projets répondent. Son enregistrement A, et le wildcard à côté, doivent déjà pointer sur ce serveur : Let’s Encrypt vérifie ce chemin avant d’émettre quoi que ce soit.",
      },
      {
        en: "The address Let’s Encrypt writes to about expiring certificates. It goes to Let’s Encrypt and to no one else.",
        fr: "L’adresse à laquelle Let’s Encrypt écrit au sujet des certificats qui expirent. Elle part chez Let’s Encrypt et chez personne d’autre.",
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
        en: "gh from GitHub’s own repository, signed in with your token, which travels on standard input and appears in no journal.",
        fr: "gh depuis le dépôt de GitHub, connecté avec votre token, qui passe par l’entrée standard et n’apparaît dans aucun log.",
      },
      {
        en: "The git credential helper that turns an HTTPS clone into a clone needing no key at all.",
        fr: "Le credential helper git qui transforme un clone HTTPS en clone n’ayant besoin d’aucune clé.",
      },
      {
        en: "A key of the server’s own, registered on your account, for the operations that want SSH.",
        fr: "Une clé propre au serveur, enregistrée sur votre compte, pour les opérations qui veulent SSH.",
      },
    ],
    asks: [
      {
        en: "Nothing, once your GitHub account is connected. The token is given once, in the app, and kept in your computer’s keychain; each server you install this on takes it from there, over the SSH session, into a file only root can read.",
        fr: "Rien, une fois votre compte GitHub connecté. Le token est donné une seule fois, dans l’app, et gardé dans le trousseau de votre ordinateur ; chaque serveur où vous posez ce module le prend de là, par la session SSH, dans un fichier que seul root peut lire.",
      },
    ],
    notes: {
      en: "Uninstalling takes back gh and the token. The server’s SSH key and the key registered on your account outlive the module: they are yours, and other hosts use them.",
      fr: "La désinstallation reprend gh et le token. La clé SSH du serveur et la clé enregistrée sur votre compte survivent au module : elles sont à vous, et d’autres hôtes s’en servent.",
    },
  },
  "tool.1password": {
    installs: [
      {
        en: "The 1Password CLI from its own repository, and the service account token in the server’s environment file and in the dev shell, which is the only place op reads it.",
        fr: "La CLI 1Password depuis son propre dépôt, et le token du compte de service dans le fichier d’environnement du serveur et dans le shell de dev, seul endroit où op le lit.",
      },
      {
        en: "A check, at install time, that the token really opens a vault — rather than letting a project’s env file fail much later, far from the cause.",
        fr: "Une vérification, à l’installation, que le token ouvre réellement un coffre — plutôt que de laisser le fichier d’environnement d’un projet échouer bien plus tard, loin de la cause.",
      },
    ],
    asks: [
      {
        en: "Nothing, once your 1Password account is connected. The service account token is given once, in the app, scoped to the vaults you want the server to read.",
        fr: "Rien, une fois votre compte 1Password connecté. Le token de compte de service est donné une seule fois, dans l’app, limité aux coffres que le serveur doit lire.",
      },
    ],
    notes: {
      en: "Secrets stay in your vault. A project that carries an env template gets its file built from the vault when it starts; the server keeps no copy of the vault. Uninstalling takes back the CLI and the token, never a project’s environment file.",
      fr: "Les secrets restent dans votre coffre. Un projet qui porte un template d’environnement voit son fichier construit depuis le coffre à son démarrage ; le serveur ne garde aucune copie du coffre. La désinstallation reprend la CLI et le token, jamais le fichier d’environnement d’un projet.",
    },
  },
  "tool.neon": {
    installs: [
      {
        en: "The Neon CLI, the binary Neon publishes for this architecture, answering to both names it uses for itself.",
        fr: "Le CLI Neon, le binaire que Neon publie pour cette architecture, qui répond aux deux noms sous lesquels il se désigne.",
      },
      {
        en: "The key you gave, in the server’s environment file and in the dev shell, so the CLI answers from a terminal without being handed anything.",
        fr: "La clé que vous donnez, dans le fichier d’environnement du serveur et dans le shell de dev, pour que le CLI réponde depuis un terminal sans rien recevoir de plus.",
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
      en: "The CLI has no token sign-in of its own: it reads a key from its own flag or from the environment, so a shell that wants it has to be given it. Uninstalling takes back the CLI and the key it stored, and never touches your Neon account.",
      fr: "Le CLI n’a pas de connexion par token : il lit une clé dans son propre flag ou dans l’environnement, donc un shell qui la veut doit la recevoir. La désinstallation reprend le CLI et la clé qu’il rangeait, et ne touche jamais à votre compte Neon.",
    },
  },
  "tool.vercel": {
    installs: [
      {
        en: "The Vercel CLI through mise, on the Node runtime, on the path of every shell.",
        fr: "Le CLI Vercel via mise, sur le runtime Node, sur le PATH de tous les shells.",
      },
      {
        en: "The token you gave, in the server’s environment file and in the dev shell as VERCEL_TOKEN, so vercel deploy, vercel env and vercel logs answer from a terminal without a sign-in.",
        fr: "Le token que vous donnez, dans le fichier d’environnement du serveur et dans le shell de dev sous VERCEL_TOKEN, pour que vercel deploy, vercel env et vercel logs répondent depuis un terminal sans connexion.",
      },
    ],
    asks: [
      {
        en: "Nothing, once your Vercel account is connected in the app. The token is given once, and the dashboard names the account it opens.",
        fr: "Rien, une fois votre compte Vercel connecté dans l’app. Le token est donné une seule fois, et le tableau de bord nomme le compte qu’il ouvre.",
      },
    ],
    notes: {
      en: "Uninstalling takes back the CLI and the token it stored, and never touches a project or a deployment.",
      fr: "La désinstallation reprend le CLI et le token qu’il rangeait, et ne touche jamais à un projet ou un déploiement.",
    },
  },
  "tool.supabase": {
    installs: [
      {
        en: "The Supabase CLI as the Go binary of its GitHub release, for this architecture, refused unless its checksum is the one the release publishes, then placed under /usr/local/bin.",
        fr: "Le CLI Supabase sous la forme du binaire Go de sa release GitHub, pour cette architecture, refusé si son checksum n’est pas celui que la release publie, puis posé sous /usr/local/bin.",
      },
      {
        en: "The access token you gave, in the server’s environment file and in the dev shell as SUPABASE_ACCESS_TOKEN.",
        fr: "Le token d’accès que vous donnez, dans le fichier d’environnement du serveur et dans le shell de dev sous SUPABASE_ACCESS_TOKEN.",
      },
    ],
    asks: [
      {
        en: "Nothing, once your Supabase account is connected in the app. The dashboard names the organisations the token opens.",
        fr: "Rien, une fois votre compte Supabase connecté dans l’app. Le tableau de bord nomme les organisations que le token ouvre.",
      },
    ],
    notes: {
      en: "supabase link, db push and functions deploy work from the server as they do from your laptop; the local stack (supabase start) needs Docker, which is its own module. Uninstalling takes back the CLI and the token, never a project.",
      fr: "supabase link, db push et functions deploy marchent depuis le serveur comme depuis votre portable ; la stack locale (supabase start) demande Docker, qui est un module à part. La désinstallation reprend le CLI et le token, jamais un projet.",
    },
  },
  "tool.stripe": {
    installs: [
      {
        en: "The Stripe CLI as the Go binary of its GitHub release, for this architecture, refused unless its checksum is the one the release publishes, then placed under /usr/local/bin.",
        fr: "Le CLI Stripe sous la forme du binaire Go de sa release GitHub, pour cette architecture, refusé si son checksum n’est pas celui que la release publie, puis posé sous /usr/local/bin.",
      },
      {
        en: "The key you gave, in the server’s environment file and in the dev shell as STRIPE_API_KEY.",
        fr: "La clé que vous donnez, dans le fichier d’environnement du serveur et dans le shell de dev sous STRIPE_API_KEY.",
      },
    ],
    asks: [
      {
        en: "Nothing, once your Stripe account is connected in the app with a restricted test-mode key. The dashboard names the account it opens.",
        fr: "Rien, une fois votre compte Stripe connecté dans l’app avec une clé restreinte en mode test. Le tableau de bord nomme le compte qu’elle ouvre.",
      },
    ],
    notes: {
      en: "stripe listen --forward-to 127.0.0.1:3000/webhooks brings your test webhooks onto a project of the machine, and stripe trigger fires the events. Never give the live secret key: the CLI has no need of it. Uninstalling takes back the CLI and the key, never a customer or a webhook.",
      fr: "stripe listen --forward-to 127.0.0.1:3000/webhooks amène vos webhooks de test sur un projet de la machine, et stripe trigger déclenche les événements. Ne donnez jamais la clé secrète de production : le CLI n’en a pas besoin. La désinstallation reprend le CLI et la clé, jamais un client ni un webhook.",
    },
  },
  "tool.wrangler": {
    installs: [
      {
        en: "Wrangler, Cloudflare’s CLI, installed by mise on the server’s Node, so it lands on the path of the dev shell and upgrades like a runtime.",
        fr: "Wrangler, le CLI de Cloudflare, posé par mise sur le Node du serveur, pour qu’il arrive sur le PATH du shell de dev et se mette à niveau comme un runtime.",
      },
      {
        en: "The token you gave and the account it opens, in the server’s environment file and in the dev shell, as the two variables Wrangler reads on its own — no wrangler login on the server.",
        fr: "Le token que vous donnez et le compte qu’il ouvre, dans le fichier d’environnement du serveur et dans le shell de dev, sous les deux variables que Wrangler lit lui-même — aucun wrangler login sur le serveur.",
      },
      {
        en: "Nothing else: your Workers, your D1 databases and your Pages projects stay yours to create and deploy.",
        fr: "Rien d’autre : vos Workers, vos bases D1 et vos projets Pages restent les vôtres à créer et à déployer.",
      },
    ],
    asks: [
      {
        en: "A second token of your Cloudflare account, connected once in the app’s settings under Wrangler. This one goes to the server, so it carries only what the server deploys — Workers Scripts, D1, Pages — and nothing over your tunnels or your domain, which stay with the token that never leaves your computer.",
        fr: "Un second token de votre compte Cloudflare, connecté une fois dans les réglages de l’app sous Wrangler. Celui-ci part sur le serveur : il ne porte que ce que le serveur déploie — Workers Scripts, D1, Pages — et rien sur vos tunnels ni votre domaine, qui restent au token qui ne quitte jamais votre ordinateur.",
      },
    ],
    notes: {
      en: "The service page says whose account the token opens, in Wrangler’s own words. A token that opens several accounts deploys to the one of your connection. Uninstalling takes back the CLI and the two variables, and never touches your Cloudflare account.",
      fr: "La fiche du service dit quel compte le token ouvre, dans les mots de Wrangler. Un token qui ouvre plusieurs comptes déploie sur celui de votre connexion. La désinstallation reprend le CLI et les deux variables, et ne touche jamais à votre compte Cloudflare.",
    },
  },
}
