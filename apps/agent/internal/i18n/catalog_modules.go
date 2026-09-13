package i18n

// The catalogue manifests: what the configuration screen shows for each module.
var moduleCatalog = map[string]Message{
	"module.ai.browser.summary": {
		FR: "Chrome sans interface et les bibliothèques dont Playwright a besoin, la commande shot qui range ses captures dans ~/shots, et la galerie qui les sert en local.",
		EN: "Headless Chrome and the libraries Playwright needs, the shot command that files its captures under ~/shots, and the gallery that serves them locally.",
	},
	"module.ai.browser.name": {
		FR: "Navigateur et galerie",
		EN: "Browser and gallery",
	},
	"module.ai.claude.summary": {
		FR: "Claude Code installé pour dev, avec le contexte de la machine et les skills Pupitre. La connexion se fait par l'URL que l'outil affiche au premier lancement.",
		EN: "Claude Code installed for dev, with the machine's context and the Pupitre skills. Signing in happens through the URL the tool prints on first run.",
	},
	"module.ai.codex.summary": {
		FR: "Codex installé pour dev, avec le contexte de la machine et les skills Pupitre. La connexion passe par l'URL affichée au premier lancement et votre abonnement.",
		EN: "Codex installed for dev, with the machine's context and the Pupitre skills. Signing in goes through the URL printed on first run and your own subscription.",
	},
	"module.ai.cursor.summary": {
		FR: "Le CLI de Cursor installé pour dev, avec les skills Pupitre. Cursor n'a pas de fichier de contexte global : vos règles restent dans votre compte. La connexion passe par l'URL affichée par cursor-agent login et votre abonnement Cursor.",
		EN: "The Cursor CLI installed for dev, with the Pupitre skills. Cursor has no global context file: your rules stay in your account. Signing in goes through the URL cursor-agent login prints and your own Cursor subscription.",
	},
	"module.ai.opencode.summary": {
		FR: "OpenCode installé pour dev, avec le contexte de la machine et les skills Pupitre. Open source et sans fournisseur imposé : opencode auth login branche un abonnement Claude, ChatGPT ou Copilot, ou la clé d'un des fournisseurs qu'il connaît.",
		EN: "OpenCode installed for dev, with the machine's context and the Pupitre skills. Open source and tied to no provider: opencode auth login connects a Claude, ChatGPT or Copilot subscription, or the key of any provider it knows.",
	},
	"module.ai.hermes.always_on.help": {
		FR: "Un service systemd garde Hermes en marche entre deux sessions.",
		EN: "A systemd service keeps Hermes running between two sessions.",
	},
	"module.ai.hermes.always_on.label": {
		FR: "Toujours actif",
		EN: "Always on",
	},
	"module.ai.hermes.providers.label": {
		FR: "Fournisseurs de modèles",
		EN: "Model providers",
	},
	"module.ai.hermes.summary": {
		FR: "L'agent Hermes de Nous Research, posé par Python, avec les fournisseurs de modèles de votre choix et, si vous le voulez, un service qui le garde en marche.",
		EN: "The Hermes agent from Nous Research, installed through Python, with the model providers of your choice and, if you want one, a service that keeps it running.",
	},
	"module.core.hardening.keep_root.help": {
		FR: "Root reste joignable, par clé seulement, jamais par mot de passe. Pour qui veut garder la main sur son serveur.",
		EN: "Root stays reachable, by key only, never by password. For those who want to keep a hand on their server.",
	},
	"module.core.hardening.keep_root.label": {
		FR: "Garder l'accès root",
		EN: "Keep root access",
	},
	"module.core.hardening.name": {
		FR: "Durcissement",
		EN: "Hardening",
	},
	"module.core.hardening.ssh_443.help": {
		FR: "Pour les réseaux qui filtrent le port 22.",
		EN: "For networks that filter port 22.",
	},
	"module.core.hardening.ssh_443.label": {
		FR: "SSH aussi sur le port 443",
		EN: "SSH on port 443 as well",
	},
	"module.core.hardening.summary": {
		FR: "Pare-feu ufw sur SSH seul, fail2ban, puis fermeture de root et des mots de passe une fois qu'une clé ouvre dev.",
		EN: "ufw on SSH alone, fail2ban, then root and passwords closed once a key opens dev.",
	},
	"module.core.system.git_email.label": {
		FR: "Email pour git",
		EN: "Email for git",
	},
	"module.core.system.git_name.label": {
		FR: "Nom pour git",
		EN: "Name for git",
	},
	"module.core.system.name": {
		FR: "Système",
		EN: "System",
	},
	"module.core.system.projects_dir.label": {
		FR: "Dossier des projets",
		EN: "Projects folder",
	},
	"module.core.system.summary": {
		FR: "Paquets de base, fuseau, mises à jour de sécurité, swap, garde-fou mémoire, utilisateur dev avec sudo, zsh, tmux, identité git et service de l'agent.",
		EN: "Base packages, timezone, security updates, swap, memory guard, a dev user with sudo, zsh, tmux, git identity and the agent's service.",
	},
	"module.core.system.timezone.help": {
		FR: "Nom IANA, par exemple Europe/Paris.",
		EN: "An IANA name, for example Europe/Paris.",
	},
	"module.core.system.timezone.label": {
		FR: "Fuseau horaire",
		EN: "Timezone",
	},
	"module.db.mongodb.app_password.help": {
		FR: "Celui que vos applications et votre poste utilisent, à travers le tunnel SSH.",
		EN: "The one your applications and your laptop use, through the SSH tunnel.",
	},
	"module.db.mongodb.app_password.label": {
		FR: "Mot de passe de l'utilisateur applicatif",
		EN: "Application user password",
	},
	"module.db.mongodb.app_user.help": {
		FR: "Celui que vos applications et votre poste utilisent.",
		EN: "The one your applications and your laptop use.",
	},
	"module.db.mongodb.app_user.label": {
		FR: "Utilisateur applicatif",
		EN: "Application user",
	},
	"module.db.mongodb.cache_mb.help": {
		FR: "0 : un quart de la mémoire de la machine.",
		EN: "0: a quarter of the machine's memory.",
	},
	"module.db.mongodb.cache_mb.label": {
		FR: "Cache WiredTiger (Mo)",
		EN: "WiredTiger cache (MB)",
	},
	"module.db.mongodb.port.help": {
		FR: "Sur 127.0.0.1 seulement.",
		EN: "On 127.0.0.1 only.",
	},
	"module.db.mongodb.port.label": {
		FR: "Port",
		EN: "Port",
	},
	"module.db.mongodb.summary": {
		FR: "MongoDB à la version choisie, lié à 127.0.0.1 sur le port voulu, authentification active, un utilisateur applicatif et les archives mongodump de ~/dumps importées.",
		EN: "MongoDB at the chosen version, bound to 127.0.0.1 on the port you want, authentication on, one application user, and the mongodump archives in ~/dumps imported.",
	},
	"module.db.mongodb.version.label": {
		FR: "Version majeure",
		EN: "Major version",
	},
	"module.db.mysql.app_password.label": {
		FR: "Mot de passe du compte applicatif",
		EN: "Application account password",
	},
	"module.db.mysql.app_user.help": {
		FR: "Celui que vos applications utilisent en TCP sur la boucle locale.",
		EN: "The one your applications use over TCP on the loopback.",
	},
	"module.db.mysql.app_user.label": {
		FR: "Compte applicatif",
		EN: "Application account",
	},
	"module.db.mysql.buffer_pool.help": {
		FR: "Vide : un quart de la mémoire de la machine. Sinon une taille MySQL, par exemple 2G.",
		EN: "Empty: a quarter of the machine's memory. Otherwise a MySQL size, for example 2G.",
	},
	"module.db.mysql.buffer_pool.label": {
		FR: "Buffer pool InnoDB",
		EN: "InnoDB buffer pool",
	},
	"module.db.mysql.engine.help": {
		FR: "MariaDB reste compatible avec la plupart des clients MySQL.",
		EN: "MariaDB stays compatible with most MySQL clients.",
	},
	"module.db.mysql.engine.label": {
		FR: "Moteur",
		EN: "Engine",
	},
	"module.db.mysql.name": {
		FR: "MySQL 8 ou MariaDB",
		EN: "MySQL 8 or MariaDB",
	},
	"module.db.mysql.port.help": {
		FR: "Sur 127.0.0.1 seulement.",
		EN: "On 127.0.0.1 only.",
	},
	"module.db.mysql.port.label": {
		FR: "Port",
		EN: "Port",
	},
	"module.db.mysql.remote_password.help": {
		FR: "Celui que votre poste utilise à travers le tunnel SSH.",
		EN: "The one your laptop uses through the SSH tunnel.",
	},
	"module.db.mysql.remote_password.label": {
		FR: "Mot de passe du compte distant",
		EN: "Remote account password",
	},
	"module.db.mysql.remote_user.help": {
		FR: "Celui que votre poste utilise à travers le tunnel SSH.",
		EN: "The one your laptop uses through the SSH tunnel.",
	},
	"module.db.mysql.remote_user.label": {
		FR: "Compte distant",
		EN: "Remote account",
	},
	"module.db.mysql.summary": {
		FR: "Le moteur choisi, lié à 127.0.0.1 sur le port voulu, root sur socket, un compte pour les applications, un pour votre poste à travers SSH, et les dumps de ~/dumps importés.",
		EN: "The engine you pick, bound to 127.0.0.1 on the port you want, root on socket, one account for applications, one for your laptop through SSH, and the dumps in ~/dumps imported.",
	},
	"module.db.postgres.app_password.label": {
		FR: "Mot de passe du rôle applicatif",
		EN: "Application role password",
	},
	"module.db.postgres.app_role.help": {
		FR: "Celui que vos applications utilisent, et qui possède les bases importées.",
		EN: "The one your applications use, and the owner of the imported databases.",
	},
	"module.db.postgres.app_role.label": {
		FR: "Rôle applicatif",
		EN: "Application role",
	},
	"module.db.postgres.port.help": {
		FR: "Sur 127.0.0.1 seulement.",
		EN: "On 127.0.0.1 only.",
	},
	"module.db.postgres.port.label": {
		FR: "Port",
		EN: "Port",
	},
	"module.db.postgres.remote_password.help": {
		FR: "Celui que votre poste utilise à travers le tunnel SSH.",
		EN: "The one your laptop uses through the SSH tunnel.",
	},
	"module.db.postgres.remote_password.label": {
		FR: "Mot de passe du rôle distant",
		EN: "Remote role password",
	},
	"module.db.postgres.remote_role.help": {
		FR: "Celui que votre poste utilise à travers le tunnel SSH.",
		EN: "The one your laptop uses through the SSH tunnel.",
	},
	"module.db.postgres.remote_role.label": {
		FR: "Rôle distant",
		EN: "Remote role",
	},
	"module.db.postgres.shared_buffers.help": {
		FR: "Vide : un quart de la mémoire de la machine. Sinon une taille PostgreSQL, par exemple 2GB.",
		EN: "Empty: a quarter of the machine's memory. Otherwise a PostgreSQL size, for example 2GB.",
	},
	"module.db.postgres.shared_buffers.label": {
		FR: "Mémoire partagée",
		EN: "Shared buffers",
	},
	"module.db.postgres.summary": {
		FR: "PostgreSQL à la version choisie, lié à 127.0.0.1 sur le port voulu, un rôle pour les applications, un pour votre poste à travers SSH, les extensions courantes et les dumps de ~/dumps importés.",
		EN: "PostgreSQL at the chosen version, bound to 127.0.0.1 on the port you want, one role for applications, one for your laptop through SSH, the usual extensions and the dumps in ~/dumps imported.",
	},
	"module.db.postgres.version.label": {
		FR: "Version majeure",
		EN: "Major version",
	},
	"module.db.redis.maxmemory_mb.help": {
		FR: "0 : aucune limite, Redis prend ce dont il a besoin.",
		EN: "0: no cap, Redis takes what it needs.",
	},
	"module.db.redis.maxmemory_mb.label": {
		FR: "Mémoire maximale (Mo)",
		EN: "Maximum memory (MB)",
	},
	"module.db.redis.maxmemory_policy.help": {
		FR: "Ce que Redis évince une fois le plafond atteint. Sans plafond, il n'évince rien.",
		EN: "What Redis evicts once the cap is reached. Without a cap it evicts nothing.",
	},
	"module.db.redis.maxmemory_policy.label": {
		FR: "Politique d'éviction",
		EN: "Eviction policy",
	},
	"module.db.redis.auth.refused": {
		FR: "redis refuse le mot de passe : journalctl -u %s -n 40",
		EN: "redis refuses the password: journalctl -u %s -n 40",
	},
	"module.db.redis.password.label": {
		FR: "Mot de passe",
		EN: "Password",
	},
	"module.db.redis.persistence.help": {
		FR: "Le journal append-only : les données survivent à un redémarrage.",
		EN: "The append-only journal: the data survives a restart.",
	},
	"module.db.redis.persistence.label": {
		FR: "Persistance",
		EN: "Persistence",
	},
	"module.db.redis.port.help": {
		FR: "Sur 127.0.0.1 seulement.",
		EN: "On 127.0.0.1 only.",
	},
	"module.db.redis.port.label": {
		FR: "Port",
		EN: "Port",
	},
	"module.db.redis.summary": {
		FR: "Cache et files d'attente, liés à 127.0.0.1, avec mot de passe, persistance et limite mémoire au choix.",
		EN: "Cache and queues, bound to 127.0.0.1, with a password, persistence and a memory cap of your choosing.",
	},
	"module.editor.jetbrains.ide.label": {
		FR: "IDE",
		EN: "IDE",
	},
	"module.editor.jetbrains.summary": {
		FR: "Le backend de développement distant posé d'avance là où JetBrains Gateway le cherche, JVM taillée pour la mémoire de la machine ; la licence reste la vôtre, rien à activer ici.",
		EN: "The remote development backend put where JetBrains Gateway looks for it, with a JVM sized for the machine's memory; the licence stays yours, nothing to activate here.",
	},
	"module.editor.jetbrains.version.label": {
		FR: "Version",
		EN: "Version",
	},
	"module.editor.vscode.extensions.label": {
		FR: "Extensions",
		EN: "Extensions",
	},
	"module.editor.vscode.summary": {
		FR: "La commande code et le serveur distant posés d'avance : la première connexion Remote SSH n'installe plus rien, extensions comprises. Vaut aussi pour Cursor et Windsurf, qui posent leur propre serveur par le même mécanisme.",
		EN: "The code command and the remote server put in place ahead of time: the first Remote SSH connection installs nothing, extensions included. Works for Cursor and Windsurf too, which install their own server the same way.",
	},
	"module.editor.vscode.tunnel.label": {
		FR: "Remote Tunnel",
		EN: "Remote Tunnel",
	},
	"module.editor.zed.summary": {
		FR: "Le serveur distant de Zed posé d'avance pour la version que vous utilisez ; le projet s'ouvre par un lien zed://ssh, sans rien télécharger à la connexion.",
		EN: "Zed's remote server put in place ahead of time for the version you run; the project opens through a zed://ssh link, with nothing to download on connection.",
	},
	"module.editor.zed.version.label": {
		FR: "Version",
		EN: "Version",
	},
	"module.exposure.caddy.credential.domain.label": {
		FR: "Domaine",
		EN: "Domain",
	},
	"module.exposure.caddy.domain.help": {
		FR: "Le domaine sous lequel les sous-domaines des projets répondent, par exemple flymate.dev. Son enregistrement DNS doit déjà pointer sur ce serveur.",
		EN: "The domain under which the projects' subdomains answer, for example flymate.dev. Its DNS record must already point at this server.",
	},
	"module.exposure.caddy.domain.hint": {
		FR: "Chez votre registrar, créez un enregistrement A qui pointe ce domaine et le joker *.domaine sur l'adresse IP de ce serveur. Let's Encrypt vérifie ce chemin avant d'émettre le certificat : sans lui, l'installation démarre mais aucun projet n'obtient de certificat.",
		EN: "At your registrar, create an A record pointing this domain and the wildcard *.domain at this server's IP address. Let's Encrypt checks that path before issuing the certificate: without it the install runs but no project gets one.",
	},
	"module.exposure.caddy.domain.label": {
		FR: "Domaine des projets",
		EN: "Projects domain",
	},
	"module.exposure.caddy.email.help": {
		FR: "Celle qui recevra les avis d'expiration de certificat.",
		EN: "The one that will receive certificate expiry notices.",
	},
	"module.exposure.caddy.email.hint": {
		FR: "Let's Encrypt s'en sert pour prévenir d'un certificat qui approche de son expiration ou d'un renouvellement qui échoue. Elle n'est jamais publiée et ne quitte pas ce serveur.",
		EN: "Let's Encrypt uses it to warn about a certificate nearing expiry or a renewal that fails. It is never published and never leaves this server.",
	},
	"module.exposure.caddy.email.label": {
		FR: "Adresse pour Let's Encrypt",
		EN: "Address for Let's Encrypt",
	},
	"module.exposure.caddy.http_port.help": {
		FR: "Celui qui répond aux redirections et au défi ACME.",
		EN: "The one that answers redirects and the ACME challenge.",
	},
	"module.exposure.caddy.http_port.label": {
		FR: "Port HTTP",
		EN: "HTTP port",
	},
	"module.exposure.caddy.https_port.help": {
		FR: "Celui qui sert les projets.",
		EN: "The one that serves the projects.",
	},
	"module.exposure.caddy.https_port.label": {
		FR: "Port HTTPS",
		EN: "HTTPS port",
	},
	"module.exposure.caddy.summary": {
		FR: "Reverse proxy avec certificats Let's Encrypt automatiques, une route par projet qui déclare un sous-domaine, pour un domaine qui n'est pas chez Cloudflare.",
		EN: "A reverse proxy with automatic Let's Encrypt certificates, one route per project that declares a subdomain, for a domain that is not on Cloudflare.",
	},
	"module.exposure.cloudflare.account_tag.label": {
		FR: "Compte du tunnel",
		EN: "Tunnel account",
	},
	"module.exposure.cloudflare.credential.domain.label": {
		FR: "Domaine",
		EN: "Domain",
	},
	"module.exposure.cloudflare.domain.help": {
		FR: "Le domaine sous lequel les sous-domaines des projets de ce serveur répondent. Il appartient à une zone de votre compte Cloudflare.",
		EN: "The domain under which this server's project subdomains answer. It belongs to a zone of your Cloudflare account.",
	},
	"module.exposure.cloudflare.domain.hint": {
		FR: "Pas d'enregistrement DNS à créer : l'app écrit elle-même un CNAME par projet vers le tunnel, et Cloudflare émet le certificat. Le domaine peut être la zone elle-même ou un sous-domaine de celle-ci, ce qui donne à chaque serveur le sien.",
		EN: "No DNS record to create: the app writes one CNAME per project towards the tunnel itself, and Cloudflare issues the certificate. The domain may be the zone itself or a subdomain of it, which gives each server its own.",
	},
	"module.exposure.cloudflare.domain.label": {
		FR: "Domaine des projets",
		EN: "Projects domain",
	},
	"module.exposure.cloudflare.summary": {
		FR: "Un tunnel et un sous-domaine par projet sur votre compte Cloudflare, le certificat étant géré par Cloudflare.",
		EN: "A tunnel and one subdomain per project on your own Cloudflare account, with the certificate managed by Cloudflare.",
	},
	"module.exposure.cloudflare.tunnel_id.label": {
		FR: "Identifiant du tunnel",
		EN: "Tunnel identifier",
	},
	"module.exposure.cloudflare.tunnel_secret.label": {
		FR: "Secret du tunnel",
		EN: "Tunnel secret",
	},
	"module.runtime.docker.compose.help": {
		FR: "Le plugin docker compose, et buildx avec lui.",
		EN: "The docker compose plugin, and buildx with it.",
	},
	"module.runtime.docker.compose.label": {
		FR: "Compose",
		EN: "Compose",
	},
	"module.runtime.docker.data_root.help": {
		FR: "Vide : /var/lib/docker. Sinon un chemin absolu, sur le disque qui a la place.",
		EN: "Empty: /var/lib/docker. Otherwise an absolute path, on the disk that has the room.",
	},
	"module.runtime.docker.data_root.label": {
		FR: "Dossier des images",
		EN: "Images folder",
	},
	"module.runtime.docker.log_max_size.help": {
		FR: "Vide : 10m. La rotation garde trois fichiers par conteneur.",
		EN: "Empty: 10m. Rotation keeps three files per container.",
	},
	"module.runtime.docker.log_max_size.label": {
		FR: "Taille d'un fichier de log",
		EN: "Size of one log file",
	},
	"module.runtime.docker.summary": {
		FR: "Docker Engine et Compose depuis le dépôt de Docker, l'utilisateur dev dans le groupe docker, le démon lié à sa socket et à rien d'autre.",
		EN: "Docker Engine and Compose from Docker's own repository, the dev user in the docker group, and the daemon bound to its socket and nothing else.",
	},
	"module.runtime.go.go_version.label": {
		FR: "Version de Go",
		EN: "Go version",
	},
	"module.runtime.go.gopath.help": {
		FR: "Vide : ~/go. Sinon un chemin absolu, par exemple /srv/go.",
		EN: "Empty: ~/go. Otherwise an absolute path, for example /srv/go.",
	},
	"module.runtime.go.gopath.label": {
		FR: "GOPATH",
		EN: "GOPATH",
	},
	"module.runtime.go.summary": {
		FR: "Go par mise, à la version choisie, avec GOPATH et les binaires de go install actifs dans tous les shells.",
		EN: "Go through mise, at the chosen version, with GOPATH and the binaries of go install active in every shell.",
	},
	"module.runtime.java.java_version.label": {
		FR: "Version de Java",
		EN: "Java version",
	},
	"module.runtime.java.summary": {
		FR: "Temurin par mise, JAVA_HOME pour tous les shells et daemon Gradle dimensionné d'après la mémoire de la machine.",
		EN: "Temurin through mise, JAVA_HOME for every shell, and a Gradle daemon sized after the machine's memory.",
	},
	"module.runtime.node.bun.help": {
		FR: "Exécution et gestionnaire de paquets JavaScript.",
		EN: "A JavaScript runtime and package manager.",
	},
	"module.runtime.node.bun.label": {
		FR: "Bun",
		EN: "Bun",
	},
	"module.runtime.node.node_version.label": {
		FR: "Version de Node",
		EN: "Node version",
	},
	"module.runtime.node.pnpm.help": {
		FR: "Avec corepack, chaque dépôt garde la version qu'il déclare.",
		EN: "With corepack, every repository keeps the version it declares.",
	},
	"module.runtime.node.pnpm.label": {
		FR: "pnpm",
		EN: "pnpm",
	},
	"module.runtime.node.summary": {
		FR: "mise, Node à la version choisie, Bun, pnpm et Yarn en option, actifs dans tous les shells y compris ceux d'une commande ssh.",
		EN: "mise, Node at the chosen version, Bun, pnpm and Yarn optional, active in every shell including those of an ssh command.",
	},
	"module.runtime.node.yarn.help": {
		FR: "Par corepack, comme pnpm. Peu de dépôts récents en ont encore besoin.",
		EN: "Through corepack, like pnpm. Few recent repositories still need it.",
	},
	"module.runtime.node.yarn.label": {
		FR: "Yarn",
		EN: "Yarn",
	},
	"module.runtime.php.composer.help": {
		FR: "Le gestionnaire de dépendances de l'écosystème PHP.",
		EN: "The dependency manager of the PHP ecosystem.",
	},
	"module.runtime.php.composer.label": {
		FR: "Composer",
		EN: "Composer",
	},
	"module.runtime.php.memory_limit.help": {
		FR: "La limite mémoire du CLI. Vide : 512M.",
		EN: "The CLI's memory cap. Empty: 512M.",
	},
	"module.runtime.php.memory_limit.label": {
		FR: "memory_limit",
		EN: "memory_limit",
	},
	"module.runtime.php.php_version.label": {
		FR: "Version de PHP",
		EN: "PHP version",
	},
	"module.runtime.php.summary": {
		FR: "PHP compilé par mise à la version choisie, Composer en option, actifs dans tous les shells.",
		EN: "PHP compiled by mise at the chosen version, Composer optional, active in every shell.",
	},
	"module.runtime.python.python_version.label": {
		FR: "Version de Python",
		EN: "Python version",
	},
	"module.runtime.python.summary": {
		FR: "uv et un interpréteur Python à la version choisie, tous deux posés par mise et actifs dans tous les shells.",
		EN: "uv and a Python interpreter at the chosen version, both installed by mise and active in every shell.",
	},
	"module.runtime.ruby.bundler.help": {
		FR: "Le gestionnaire de dépendances de l'écosystème Ruby.",
		EN: "The dependency manager of the Ruby ecosystem.",
	},
	"module.runtime.ruby.bundler.label": {
		FR: "Bundler",
		EN: "Bundler",
	},
	"module.runtime.ruby.ruby_version.label": {
		FR: "Version de Ruby",
		EN: "Ruby version",
	},
	"module.runtime.ruby.summary": {
		FR: "Ruby compilé par mise à la version choisie, Bundler en option, actifs dans tous les shells.",
		EN: "Ruby compiled by mise at the chosen version, Bundler optional, active in every shell.",
	},
	"module.tool.1password.service_account_token.label": {
		FR: "Jeton du compte de service",
		EN: "Service account token",
	},
	"module.tool.1password.summary": {
		FR: "La CLI op et un compte de service, pour produire le .env.local d'un projet depuis le gabarit que son dépôt versionne.",
		EN: "The op CLI and a service account, to produce a project's .env.local from the template its repository versions.",
	},
	"module.tool.github.summary": {
		FR: "La commande gh, le clone HTTPS sans clé grâce au jeton, et la clé publique du serveur enregistrée sur le compte.",
		EN: "The gh command, HTTPS clones without a key thanks to the token, and the server's public key registered on the account.",
	},
	"module.tool.github.token.label": {
		FR: "Jeton d'accès",
		EN: "Access token",
	},
	"module.tool.neon.api_key.label": {
		FR: "Clé d'API",
		EN: "API key",
	},
	"module.tool.neon.summary": {
		FR: "Le CLI Neon posé, et la clé gardée sur la machine : vos projets parlent à votre compte Neon, et vous décidez de vos bases.",
		EN: "The Neon CLI installed, and the key kept on the machine: your projects talk to your own Neon account, which stays yours to shape.",
	},
	"module.tool.wrangler.api_token.label": {
		FR: "Jeton d'API",
		EN: "API token",
	},
	"module.tool.wrangler.account_id.label": {
		FR: "Identifiant du compte",
		EN: "Account identifier",
	},
	"module.tool.wrangler.summary": {
		FR: "Wrangler, le CLI de Cloudflare, et le jeton gardé sur la machine : vos Workers, vos bases D1 et vos Pages se déploient depuis le serveur.",
		EN: "Wrangler, Cloudflare's CLI, with the token kept on the machine: your Workers, D1 databases and Pages deploy from the server.",
	},
	"module.ai.hermes.providers.help": {
		FR: "Une entrée par fournisseur, sous la forme fournisseur:clé, par exemple openai:sk-…",
		EN: "One entry per provider, as provider:key, for example openai:sk-…",
	},
	"module.editor.jetbrains.ide.help": {
		FR: "Celui que vous ouvrez depuis Gateway ; un backend par IDE.",
		EN: "The one you open from Gateway; one backend per IDE.",
	},
	"module.editor.jetbrains.version.help": {
		FR: "latest, ou une version majeure comme 2026.2 ; le backend doit rester compatible avec votre Gateway.",
		EN: "latest, or a major version such as 2026.2; the backend has to stay compatible with your Gateway.",
	},
	"module.editor.vscode.extensions.help": {
		FR: "Un identifiant par ligne, comme esbenp.prettier-vscode ; vide, aucune extension n'est posée.",
		EN: "One identifier per line, such as esbenp.prettier-vscode; empty, no extension is installed.",
	},
	"module.editor.vscode.tunnel.help": {
		FR: "Un service garde le tunnel VS Code ouvert ; il demande une authentification une fois posé.",
		EN: "A service keeps the VS Code tunnel open; it asks for one sign-in once installed.",
	},
	"module.editor.zed.version.help": {
		FR: "latest, ou la version exacte de votre Zed (menu Zed, À propos) : le serveur distant doit correspondre au client.",
		EN: "latest, or the exact version of your Zed (Zed menu, About): the remote server has to match the client.",
	},
	"protocol.request.unreadable": {
		FR: "requête illisible : un objet JSON {id, cmd, params?} par ligne est attendu",
		EN: "the request cannot be read: one JSON object {id, cmd, params?} per line is expected",
	},
	"protocol.id.invalid": {
		FR: "id manquant ou invalide : entier ≥ 0 attendu",
		EN: "the id is missing or invalid: an integer >= 0 is expected",
	},
	"modules.step.failed": {
		FR: "étape en échec",
		EN: "step failed",
	},
	"modules.step.replay": {
		FR: "  rejeu : %s",
		EN: "  replay: %s",
	},
	"modules.uninstall.required": {
		FR: "%s ne peut pas être retiré : %s en dépend encore",
		EN: "%s cannot be removed: %s still requires it",
	},
	"modules.uninstall.required.fix": {
		FR: "Retirez d'abord %s, ou retirez les deux dans la même commande.",
		EN: "Remove %s first, or remove both in the same command.",
	},
	"modules.download.checksum_mismatch": {
		FR: "la somme SHA-256 de %s n'est pas celle publiée : %s",
		EN: "the SHA-256 of %s is not the published one: %s",
	},
	"modules.download.checksum_missing": {
		FR: "sha256sum n'a rien dit de %s",
		EN: "sha256sum said nothing of %s",
	},
	"modules.download.checksum_unpublished": {
		FR: "aucune somme publiée pour %s dans %s",
		EN: "no published checksum for %s in %s",
	},
	"modules.system.packages_refused": {
		FR: "paquets introuvables ou refusés : %s",
		EN: "packages not found or refused: %s",
	},
	"modules.mise.missing_after_download": {
		FR: "mise absent de %s après le téléchargement",
		EN: "mise missing from %s after the download",
	},
	"modules.mise.tool_not_installed": {
		FR: "mise est revenu sans installer %s@%s",
		EN: "mise returned without installing %s@%s",
	},
	"modules.mise.version_unreadable": {
		FR: "mise.jdx.dev a répondu %q au lieu d'une version",
		EN: "mise.jdx.dev answered %q instead of a version",
	},
	"modules.claude.version_unreadable": {
		FR: "downloads.claude.ai a répondu %q au lieu d'une version",
		EN: "downloads.claude.ai answered %q instead of a version",
	},
	"modules.claude.manifest_unreadable": {
		FR: "manifeste de Claude Code %s illisible : %s",
		EN: "manifest of Claude Code %s unreadable: %s",
	},
	"modules.claude.build_missing": {
		FR: "aucune version %s de Claude Code %s dans le manifeste",
		EN: "no %s build of Claude Code %s in the manifest",
	},
	"modules.claude.checksum_mismatch": {
		FR: "la somme de Claude Code %s n'est pas celle du manifeste : %s",
		EN: "checksum of Claude Code %s differs from the manifest: %s",
	},
	"modules.claude.missing_after_install": {
		FR: "%s absent après l'installation de Claude Code %s",
		EN: "%s missing after the install of Claude Code %s",
	},
	"modules.cursor.version_unreadable": {
		FR: "cursor.com/install ne nomme aucune version de Cursor CLI",
		EN: "cursor.com/install names no Cursor CLI version",
	},
	"modules.cursor.missing_after_install": {
		FR: "cursor-agent %s est absent de %s après extraction",
		EN: "cursor-agent %s is missing from %s after extraction",
	},
	"modules.opencode.version_unreadable": {
		FR: "GitHub a répondu %q au lieu d'une version d'OpenCode",
		EN: "GitHub answered %q instead of an OpenCode version",
	},
	"modules.opencode.asset_missing": {
		FR: "aucun %s dans la version %s d'OpenCode",
		EN: "no %s in OpenCode release %s",
	},
	"modules.opencode.missing_after_install": {
		FR: "opencode %s est absent de %s après extraction",
		EN: "opencode %s is missing from %s after extraction",
	},
	"modules.cloudflared.start_failed": {
		FR: "%s : %s",
		EN: "%s: %s",
	},
	"modules.mongodb.user_refused": {
		FR: "création de l'utilisateur applicatif refusée : journalctl -u %s -n 40 · %s",
		EN: "application user creation refused: journalctl -u %s -n 40 · %s",
	},
	"modules.postgres.roles_refused": {
		FR: "création des rôles refusée : journalctl -u %s -n 40 · %s",
		EN: "role creation refused: journalctl -u %s -n 40 · %s",
	},
	"modules.mysql.accounts_refused": {
		FR: "création des comptes refusée : journalctl -u %s -n 40 · %s",
		EN: "account creation refused: journalctl -u %s -n 40 · %s",
	},
	"modules.zed.missing_after_download": {
		FR: "le serveur distant Zed %s est absent de %s après décompression",
		EN: "the Zed remote server %s is missing from %s after decompression",
	},
	"modules.zed.version_unreadable": {
		FR: "version de Zed illisible dans %q",
		EN: "unreadable Zed version in %q",
	},
	"modules.jetbrains.missing_after_extract": {
		FR: "le backend %s est absent de %s après extraction",
		EN: "the %s backend is missing from %s after extraction",
	},
	"modules.jetbrains.index_unreadable": {
		FR: "index des versions JetBrains illisible pour %s",
		EN: "unreadable JetBrains version index for %s",
	},
	"modules.jetbrains.version_missing": {
		FR: "aucune version %s de %s pour cette machine",
		EN: "no %s version of %s for this machine",
	},
	"modules.vscode.cli_missing": {
		FR: "la commande code est absente de %s après extraction",
		EN: "the code command is missing from %s after extraction",
	},
	"modules.vscode.server_missing": {
		FR: "le serveur distant est absent de %s après extraction",
		EN: "the remote server is missing from %s after extraction",
	},
	"modules.vscode.no_server": {
		FR: "aucun serveur distant installé pour y poser les extensions",
		EN: "no remote server installed to place the extensions",
	},
	"modules.vscode.update_unreadable": {
		FR: "réponse illisible de %s",
		EN: "unreadable answer from %s",
	},
}
