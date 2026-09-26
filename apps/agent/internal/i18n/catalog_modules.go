package i18n

var moduleCatalog = map[string]Message{
	"module.ai.browser.summary": {
		FR: "Chrome headless et les bibliothèques dont Playwright a besoin, la commande shot qui range ses captures par projet dans ~/shots, et la galerie qui les sert, en local ou par l'exposition du serveur.",
		EN: "Headless Chrome and the libraries Playwright needs, the shot command that files its captures by project under ~/shots, and the gallery that serves them, locally or through the server's exposure.",
	},
	"module.ai.browser.subdomain.label": {
		FR: "Sous-domaine de la galerie",
		EN: "Gallery subdomain",
	},
	"module.ai.browser.subdomain.help": {
		FR: "Publie la galerie sous ce nom du domaine exposé, par le tunnel installé : shot rend alors une URL qu'un agent ou un navigateur ouvre de partout. Chaque adresse porte un jeton secret ; vider le champ retire la galerie et oublie le jeton. Vide, la galerie ne répond que sur le serveur.",
		EN: "Publishes the gallery under this name of the exposed domain, through the installed tunnel: shot then returns a URL an agent or a browser opens from anywhere. Every address carries a secret token; emptying the field withdraws the gallery and forgets the token. Empty, the gallery answers on the server only.",
	},
	"module.ai.browser.subdomain.noDomain": {
		FR: "aucun domaine exposé : la galerie n'a pas de nom sous lequel se publier",
		EN: "no exposed domain: the gallery has no name to be published under",
	},
	"module.ai.browser.subdomain.noDomain.fix": {
		FR: "Installez Cloudflare Tunnel ou Caddy avec un domaine, puis reprenez ce réglage.",
		EN: "Install Cloudflare Tunnel or Caddy with a domain, then apply this setting again.",
	},
	"module.ai.browser.subdomain.taken": {
		FR: "%s est déjà l'adresse du projet %s",
		EN: "%s is already the address of project %s",
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
	"module.ai.copilot.summary": {
		FR: "Le CLI de GitHub Copilot posé par mise, avec le contexte de la machine et les skills Pupitre. La connexion se fait par copilot login et le code d'appareil, sur votre abonnement Copilot.",
		EN: "The GitHub Copilot CLI installed through mise, with the machine's context and the Pupitre skills. Signing in goes through copilot login and the device code, on your own Copilot subscription.",
	},
	"module.ai.gemini.summary": {
		FR: "Gemini CLI posé par mise, avec le contexte de la machine et les skills Pupitre. La connexion se fait par votre compte Google — le niveau gratuit suffit — ou par une clé d'API.",
		EN: "Gemini CLI installed through mise, with the machine's context and the Pupitre skills. Signing in goes through your Google account — the free tier is enough — or an API key.",
	},
	"module.ai.cursor.summary": {
		FR: "Le CLI de Cursor installé pour dev, avec les skills Pupitre. Cursor n'a pas de fichier de contexte global : vos règles restent dans votre compte. La connexion passe par l'URL affichée par cursor-agent login et votre abonnement Cursor.",
		EN: "The Cursor CLI installed for dev, with the Pupitre skills. Cursor has no global context file: your rules stay in your account. Signing in goes through the URL cursor-agent login prints and your own Cursor subscription.",
	},
	"module.ai.openclaw.summary": {
		FR: "OpenClaw posé par mise sur le Node 24 de la machine : l'assistant personnel joignable depuis Telegram, Discord ou WhatsApp, avec les fournisseurs de modèles de votre choix, sa gateway en service systemd, et les skills Pupitre. Les canaux se branchent par openclaw onboard dans un terminal.",
		EN: "OpenClaw installed through mise on the machine's Node 24: the personal assistant reached from Telegram, Discord or WhatsApp, with the model providers of your choice, its gateway as a systemd service, and the Pupitre skills. Channels are wired with openclaw onboard in a terminal.",
	},
	"module.ai.openclaw.providers.label": {
		FR: "Fournisseurs de modèles",
		EN: "Model providers",
	},
	"module.ai.openclaw.providers.help": {
		FR: "Un fournisseur par ligne, sous la forme nom:clé — anthropic:sk-…, openai:sk-…",
		EN: "One provider per line, as name:key — anthropic:sk-…, openai:sk-…",
	},
	"module.ai.openclaw.providers.hint": {
		FR: "Le nom devient la variable que la gateway lit : anthropic donne ANTHROPIC_API_KEY, openai OPENAI_API_KEY, gemini GEMINI_API_KEY. Les clés vivent dans un fichier que seul dev peut lire.",
		EN: "The name becomes the variable the gateway reads: anthropic gives ANTHROPIC_API_KEY, openai OPENAI_API_KEY, gemini GEMINI_API_KEY. The keys live in a file only dev can read.",
	},
	"module.ai.openclaw.always_on.label": {
		FR: "Gateway toujours active",
		EN: "Gateway always on",
	},
	"module.ai.openclaw.always_on.help": {
		FR: "Un service systemd garde la gateway en marche sur 127.0.0.1:18789 : c'est elle que les canaux joignent.",
		EN: "A systemd service keeps the gateway running on 127.0.0.1:18789: it is what the channels reach.",
	},
	"modules.openclaw.node_too_old": {
		FR: "OpenClaw demande Node 24.16 ou plus récent, la machine tient %q : choisissez Node 24 dans le module Node.js et appliquez sa configuration",
		EN: "OpenClaw needs Node 24.16 or later, the machine holds %q: choose Node 24 in the Node.js module and apply its configuration",
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
		FR: "Sécurisation",
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
	"module.db.mailpit.summary": {
		FR: "Mailpit, binaire de la release GitHub vérifié par son checksum, en service systemd sous dev : un serveur SMTP local qui capture tout ce que vos projets envoient, et l'interface qui le montre, sur localhost.",
		EN: "Mailpit, the GitHub release binary checked against its digest, as a systemd service under dev: a local SMTP server that catches everything your projects send, and the interface that shows it, on the loopback.",
	},
	"module.db.mailpit.smtp_port.label": {
		FR: "Port SMTP",
		EN: "SMTP port",
	},
	"module.db.mailpit.smtp_port.help": {
		FR: "Celui que vos projets mettent dans leur configuration mail.",
		EN: "The one your projects put in their mail configuration.",
	},
	"module.db.mailpit.http_port.label": {
		FR: "Port de l'interface",
		EN: "Interface port",
	},
	"module.db.mailpit.http_port.help": {
		FR: "L'interface qui liste les messages capturés, sur 127.0.0.1.",
		EN: "The interface that lists the caught messages, on 127.0.0.1.",
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
		FR: "Celui que vos applications utilisent en TCP sur localhost.",
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
		FR: "Le fichier append-only : les données survivent à un redémarrage.",
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
		FR: "Le domaine sous lequel les sous-domaines des projets répondent, par exemple flyleaf.dev. Son enregistrement DNS doit déjà pointer sur ce serveur.",
		EN: "The domain under which the projects' subdomains answer, for example flyleaf.dev. Its DNS record must already point at this server.",
	},
	"module.exposure.caddy.domain.hint": {
		FR: "Chez votre registrar, créez un enregistrement A qui pointe ce domaine et le wildcard *.domaine sur l'adresse IP de ce serveur. Let's Encrypt vérifie ce chemin avant d'émettre le certificat : sans lui, l'installation démarre mais aucun projet n'obtient de certificat.",
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
	"module.exposure.tailscale.summary": {
		FR: "Tailscale depuis le dépôt de l'éditeur, la machine jointe à votre tailnet par une clé d'authentification : SSH et URL de preview depuis votre téléphone ou un autre poste, sans rien exposer publiquement.",
		EN: "Tailscale from the vendor's repository, the machine joined to your tailnet with an auth key: SSH and preview URLs from your phone or another computer, with nothing exposed publicly.",
	},
	"module.exposure.tailscale.auth_key.label": {
		FR: "Clé d'authentification",
		EN: "Auth key",
	},
	"module.exposure.tailscale.auth_key.help": {
		FR: "Elle ne sert qu'à joindre le tailnet une fois ; la machine garde ensuite sa propre clé de nœud.",
		EN: "It only joins the tailnet once; the machine then keeps its own node key.",
	},
	"module.exposure.tailscale.auth_key.hint": {
		FR: "Dans la console d'administration Tailscale, Settings › Keys › Generate auth key. Une clé pré-approuvée évite d'avoir à approuver la machine ensuite.",
		EN: "In the Tailscale admin console, Settings › Keys › Generate auth key. A pre-approved key saves approving the machine afterwards.",
	},
	"module.exposure.tailscale.hostname.label": {
		FR: "Nom sur le tailnet",
		EN: "Name on the tailnet",
	},
	"module.exposure.tailscale.hostname.help": {
		FR: "Vide, c'est le nom d'hôte du serveur.",
		EN: "Empty, the server's own hostname.",
	},
	"module.exposure.tailscale.ssh.label": {
		FR: "Tailscale SSH",
		EN: "Tailscale SSH",
	},
	"module.exposure.tailscale.ssh.help": {
		FR: "Ouvre SSH aux membres du tailnet par leur identité Tailscale. Tailscale répond avant sshd : ni AllowUsers, ni la fermeture de root, ni fail2ban ne s'appliquent, seule la politique d'accès du tailnet décide qui entre et sous quel compte, root compris. Désactivé par défaut ; la clé de l'app continue d'ouvrir dev.",
		EN: "Opens SSH to tailnet members by their Tailscale identity. Tailscale answers before sshd: neither AllowUsers, nor root being closed, nor fail2ban applies, only the tailnet's access policy decides who gets in and as which account, root included. Off by default; the app's key still opens dev.",
	},
	"modules.tailscale.not_running": {
		FR: "tailscale up a répondu mais le nœud n'est pas en marche : tailscale status --json le dira",
		EN: "tailscale up answered but the node is not running: tailscale status --json will say",
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
		FR: "Docker Engine et Compose depuis le dépôt de Docker, l'utilisateur dev dans le groupe docker, le daemon lié à sa socket et à rien d'autre.",
		EN: "Docker Engine and Compose from Docker's own repository, the dev user in the docker group, and the daemon bound to its socket and nothing else.",
	},
	"module.runtime.go.go_versions.label": {
		FR: "Versions de Go",
		EN: "Go versions",
	},
	"module.runtime.go.go_versions.help": {
		FR: "La plus récente cochée est celle par défaut ; un projet peut en choisir une autre.",
		EN: "The newest checked is the default; a project may pick another.",
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
		FR: "Go par mise, aux versions choisies, avec GOPATH et les binaires de go install actifs dans tous les shells.",
		EN: "Go through mise, at the chosen versions, with GOPATH and the binaries of go install active in every shell.",
	},
	"module.runtime.java.java_versions.label": {
		FR: "Versions de Java",
		EN: "Java versions",
	},
	"module.runtime.java.java_versions.help": {
		FR: "La plus récente cochée est celle par défaut ; un projet peut en choisir une autre.",
		EN: "The newest checked is the default; a project may pick another.",
	},
	"module.runtime.java.summary": {
		FR: "Temurin par mise aux versions choisies, JAVA_HOME pour tous les shells et daemon Gradle dimensionné d'après la mémoire de la machine.",
		EN: "Temurin through mise at the chosen versions, JAVA_HOME for every shell, and a Gradle daemon sized after the machine's memory.",
	},
	"module.runtime.node.bun.help": {
		FR: "Runtime et gestionnaire de paquets JavaScript.",
		EN: "A JavaScript runtime and package manager.",
	},
	"module.runtime.node.bun.label": {
		FR: "Bun",
		EN: "Bun",
	},
	"module.runtime.node.node_versions.label": {
		FR: "Versions de Node",
		EN: "Node versions",
	},
	"module.runtime.node.node_versions.help": {
		FR: "La plus récente cochée est celle par défaut ; un projet peut en choisir une autre.",
		EN: "The newest checked is the default; a project may pick another.",
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
		FR: "mise, Node aux versions choisies, Bun, pnpm et Yarn en option, actifs dans tous les shells y compris ceux d'une commande ssh.",
		EN: "mise, Node at the chosen versions, Bun, pnpm and Yarn optional, active in every shell including those of an ssh command.",
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
	"module.runtime.php.php_versions.label": {
		FR: "Versions de PHP",
		EN: "PHP versions",
	},
	"module.runtime.php.php_versions.help": {
		FR: "La plus récente cochée est celle par défaut ; un projet peut en choisir une autre.",
		EN: "The newest checked is the default; a project may pick another.",
	},
	"module.runtime.php.summary": {
		FR: "PHP compilé par mise aux versions choisies, Composer en option, actifs dans tous les shells.",
		EN: "PHP compiled by mise at the chosen versions, Composer optional, active in every shell.",
	},
	"module.runtime.python.python_versions.label": {
		FR: "Versions de Python",
		EN: "Python versions",
	},
	"module.runtime.python.python_versions.help": {
		FR: "La plus récente cochée est celle par défaut ; un projet peut en choisir une autre.",
		EN: "The newest checked is the default; a project may pick another.",
	},
	"module.runtime.python.summary": {
		FR: "uv et Python aux versions choisies, tous deux posés par mise et actifs dans tous les shells.",
		EN: "uv and Python at the chosen versions, both installed by mise and active in every shell.",
	},
	"module.runtime.ruby.bundler.help": {
		FR: "Le gestionnaire de dépendances de l'écosystème Ruby.",
		EN: "The dependency manager of the Ruby ecosystem.",
	},
	"module.runtime.ruby.bundler.label": {
		FR: "Bundler",
		EN: "Bundler",
	},
	"module.runtime.ruby.ruby_versions.label": {
		FR: "Versions de Ruby",
		EN: "Ruby versions",
	},
	"module.runtime.ruby.ruby_versions.help": {
		FR: "La plus récente cochée est celle par défaut ; un projet peut en choisir une autre.",
		EN: "The newest checked is the default; a project may pick another.",
	},
	"module.runtime.rust.summary": {
		FR: "Rust par mise, qui pose rustup et les versions choisies ; cargo, rustc et ce que cargo install construit sont sur le PATH de tous les shells.",
		EN: "Rust through mise, which installs rustup and the chosen versions; cargo, rustc and whatever cargo install builds are on the path of every shell.",
	},
	"module.runtime.rust.rust_versions.label": {
		FR: "Versions de Rust",
		EN: "Rust versions",
	},
	"module.runtime.rust.rust_versions.help": {
		FR: "La plus récente cochée est celle par défaut ; un projet peut en choisir une autre.",
		EN: "The newest checked is the default; a project may pick another.",
	},
	"module.runtime.ruby.summary": {
		FR: "Ruby compilé par mise aux versions choisies, Bundler en option, actifs dans tous les shells.",
		EN: "Ruby compiled by mise at the chosen versions, Bundler optional, active in every shell.",
	},
	"module.tool.1password.service_account_token.label": {
		FR: "Token du compte de service",
		EN: "Service account token",
	},
	"module.tool.1password.summary": {
		FR: "La CLI op et un compte de service, pour produire le .env.local d'un projet depuis le template que son dépôt versionne.",
		EN: "The op CLI and a service account, to produce a project's .env.local from the template its repository versions.",
	},
	"module.tool.github.summary": {
		FR: "La commande gh, le clone HTTPS sans clé grâce au token, et la clé publique du serveur enregistrée sur le compte.",
		EN: "The gh command, HTTPS clones without a key thanks to the token, and the server's public key registered on the account.",
	},
	"module.tool.github.token.label": {
		FR: "Token d'accès",
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
		FR: "Token d'API",
		EN: "API token",
	},
	"module.tool.wrangler.account_id.label": {
		FR: "Identifiant du compte",
		EN: "Account identifier",
	},
	"module.tool.vercel.summary": {
		FR: "Le CLI Vercel posé par mise, avec le token de votre compte Vercel dans VERCEL_TOKEN : vercel deploy, vercel env et vercel logs répondent depuis le serveur sans connexion à refaire.",
		EN: "The Vercel CLI installed through mise, with your Vercel account's token in VERCEL_TOKEN: vercel deploy, vercel env and vercel logs answer from the server with no sign-in to redo.",
	},
	"module.tool.vercel.token.label": {
		FR: "Token Vercel",
		EN: "Vercel token",
	},
	"module.tool.supabase.summary": {
		FR: "Le CLI Supabase, binaire de la release GitHub vérifié par son checksum, avec le token de votre compte dans SUPABASE_ACCESS_TOKEN : vous pushez migrations, types et fonctions depuis le serveur.",
		EN: "The Supabase CLI, the GitHub release binary checked against its checksum, with your account's token in SUPABASE_ACCESS_TOKEN: migrations, types and functions push from the server.",
	},
	"module.tool.supabase.access_token.label": {
		FR: "Token d'accès Supabase",
		EN: "Supabase access token",
	},
	"module.tool.stripe.summary": {
		FR: "Le CLI Stripe, binaire de la release GitHub vérifié par son checksum, avec une clé de votre compte dans STRIPE_API_KEY : stripe listen renvoie les webhooks sur un projet de cette machine.",
		EN: "The Stripe CLI, the GitHub release binary checked against its checksum, with a key of your account in STRIPE_API_KEY: stripe listen forwards the webhooks to a project on this machine.",
	},
	"module.tool.stripe.api_key.label": {
		FR: "Clé d'API Stripe",
		EN: "Stripe API key",
	},
	"module.tool.wrangler.summary": {
		FR: "Wrangler, le CLI de Cloudflare, et le token gardé sur la machine : vos Workers, vos bases D1 et vos Pages se déploient depuis le serveur.",
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
	"protocol.line.too_long": {
		FR: "ligne trop longue : aucune ligne du protocole ne dépasse quatre mébioctets",
		EN: "the line is too long: no line of the protocol exceeds four mebibytes",
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
		FR: "  relance : %s",
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
	"harden.sshd.ignored": {
		FR: "sshd ne lit pas %s (%s) : ajoutez « Include /etc/ssh/sshd_config.d/*.conf » en tête de /etc/ssh/sshd_config, puis relancez harden ; fragment retiré, root reste ouvert",
		EN: "sshd does not read %s (%s): add \"Include /etc/ssh/sshd_config.d/*.conf\" at the top of /etc/ssh/sshd_config, then run harden again; the fragment was removed, root stays open",
	},
	"harden.sshd.ignored.unrestored": {
		FR: "sshd ne lit pas %s (%s) : ajoutez « Include /etc/ssh/sshd_config.d/*.conf » en tête de /etc/ssh/sshd_config, puis relancez harden ; fragment retiré mais sshd n'a pas pu être rechargé, root reste ouvert : %s",
		EN: "sshd does not read %s (%s): add \"Include /etc/ssh/sshd_config.d/*.conf\" at the top of /etc/ssh/sshd_config, then run harden again; the fragment was removed but sshd could not be reloaded, root stays open: %s",
	},
	"harden.keys.untrusted": {
		FR: "sshd (StrictModes) ignorerait %s : il doit appartenir à %s et n'être accessible en écriture qu'à lui ; chown -R %[2]s:%[2]s ~%[2]s/.ssh && chmod 700 ~%[2]s/.ssh && chmod 600 ~%[2]s/.ssh/authorized_keys, puis relancez harden",
		EN: "sshd (StrictModes) would ignore %s: it must belong to %s and be writable by them alone; chown -R %[2]s:%[2]s ~%[2]s/.ssh && chmod 700 ~%[2]s/.ssh && chmod 600 ~%[2]s/.ssh/authorized_keys, then run harden again",
	},
	"warn.hardening.root_stays_open": {
		FR: "le fragment sshd n'est pas réécrit : root ouvre encore par clé et seule la commande harden le ferme, après avoir vérifié qu'une clé ouvre dev",
		EN: "the sshd fragment was left as it is: root still opens by key and only the harden command closes it, once a key is known to open dev",
	},
	"warn.system.timezone.failed": {
		FR: "fuseau horaire %s non appliqué, l'horloge reste sur celui du système : %s",
		EN: "the time zone was not set to %s, the clock stays on the system's: %s",
	},
	"field.postgres.version.held": {
		FR: "le cluster tourne sur PostgreSQL %s : passez-le sur %[2]s à la main (apt-get install postgresql-%[2]s, puis pg_upgradecluster %[1]s main, puis pg_dropcluster %[1]s main) avant de changer la version ici",
		EN: "the cluster runs on PostgreSQL %s: move it to %[2]s by hand (apt-get install postgresql-%[2]s, then pg_upgradecluster %[1]s main, then pg_dropcluster %[1]s main) before changing the version here",
	},
	"field.mysql.engine.held": {
		FR: "%s tourne sur cette machine : retirez db.mysql, puis réinstallez-le sur %s ; les données de /var/lib/mysql restent en place",
		EN: "%s runs on this machine: remove db.mysql, then install it again on %s; the data under /var/lib/mysql stays in place",
	},
	"field.mongodb.version.unpublished": {
		FR: "MongoDB ne publie pas la %s pour Ubuntu %s : choisissez %s",
		EN: "MongoDB does not publish %s for Ubuntu %s: choose %s",
	},
	"field.mongodb.version.unsupported": {
		FR: "MongoDB ne publie aucune des versions proposées pour Ubuntu %s",
		EN: "MongoDB publishes none of the offered versions for Ubuntu %s",
	},
	"field.mongodb.version.held": {
		FR: "le serveur tourne sur MongoDB %s : montez-le sur %s à la main (db.adminCommand({ setFeatureCompatibilityVersion: \"%[1]s\", confirm: true }), puis les paquets de %[2]s) avant de changer la version ici",
		EN: "the server runs on MongoDB %s: move it to %s by hand (db.adminCommand({ setFeatureCompatibilityVersion: \"%[1]s\", confirm: true }), then the %[2]s packages) before changing the version here",
	},
	"db.name.invalid": {
		FR: "nom de base refusé : %s",
		EN: "database name refused: %s",
	},
	"db.name.invalid.fix": {
		FR: "Un nom de base tient en lettres, chiffres, tirets et tirets bas, 64 caractères au plus.",
		EN: "A database name is letters, digits, dashes and underscores, 64 characters at most.",
	},
	"modules.caddy.invalid": {
		FR: "caddy refuse %s, le serveur garde la configuration précédente : %s",
		EN: "caddy refuses %s, the server keeps the previous configuration: %s",
	},
	"modules.caddy.invalid.fix": {
		FR: "le Caddyfile vient du domaine du service Caddy et des sous-domaines des projets : corrigez la valeur que caddy cite, puis synchronisez de nouveau",
		EN: "the Caddyfile comes from the Caddy service's domain and the projects' subdomains: correct the value caddy quotes, then sync again",
	},
	"modules.mise.list_failed": {
		FR: "mise ne peut pas dire ce qui est installé : %s",
		EN: "mise cannot say what is installed: %s",
	},
	"modules.mise.no_project": {
		FR: "aucun projet n'y est épinglé",
		EN: "no project is pinned on it",
	},
	"warn.mise.options.rotated": {
		FR: "%s : les versions demandées (%s) ne sont plus proposées, %s est installée à leur place ; rouvrez le formulaire pour choisir",
		EN: "%s: the versions asked for (%s) are no longer offered, %s is installed instead; open the form again to choose",
	},
	"warn.mise.prune.foreign": {
		FR: "%s %s n'a pas été installé par Pupitre et reste en place : mise uninstall %[1]s@%[2]s pour le retirer",
		EN: "%s %s was not installed by Pupitre and stays in place: mise uninstall %[1]s@%[2]s to remove it",
	},
	"warn.mise.prune.pinned": {
		FR: "%s %s reste en place : %s l'épingle encore ; changez la version de ces projets pour le retirer",
		EN: "%s %s stays in place: %s still pins it; change those projects' version to remove it",
	},
	"warn.mise.upgrade.replaced": {
		FR: "%s %s remplacé par %s : les environnements virtuels, gems et paquets globaux construits dessus sont partis ; à resynchroniser : %s",
		EN: "%s %s replaced by %s: the virtual environments, gems and global packages built on it are gone; to sync again: %s",
	},
	"field.docker.data_root.busy": {
		FR: "des conteneurs tournent : arrêtez-les (docker stop $(docker ps -q)), déplacez /var/lib/docker vers %s, puis changez la racine ici",
		EN: "containers are running: stop them (docker stop $(docker ps -q)), move /var/lib/docker to %s, then change the root here",
	},
	"warn.docker.published.containers": {
		FR: "ces conteneurs publient encore sur toutes les adresses, sans qu'ufw les filtre : %s",
		EN: "these containers still publish on every address, which ufw does not filter: %s",
	},
	"warn.docker.published.networks": {
		FR: "ces réseaux publient encore sur toutes les adresses un port demandé sans adresse : %s",
		EN: "these networks still publish a port asked without an address on every address: %s",
	},
	"warn.docker.published.fix": {
		FR: "pour les fermer : arrêtez les conteneurs (docker stop $(docker ps -q)), relancez le démon (sudo systemctl restart docker), puis recréez chaque projet compose dans son dossier (docker compose down && docker compose up -d) et chaque réseau créé à la main (docker network rm <réseau> && docker network create <réseau>)",
		EN: "to close them: stop the containers (docker stop $(docker ps -q)), restart the daemon (sudo systemctl restart docker), then recreate each compose project in its folder (docker compose down && docker compose up -d) and each network made by hand (docker network rm <network> && docker network create <network>)",
	},
	"warn.docker.group.reopen": {
		FR: "%s vient de rejoindre le groupe %s : les terminaux et la session tmux déjà ouverts ne le voient pas, rouvrez-les avant d'appeler docker sans sudo",
		EN: "%s just joined the %s group: the terminals and the tmux session already open do not see it, open them again before calling docker without sudo",
	},
	"warn.php.memory_limit.normalised": {
		FR: "memory_limit %s écrit %s : PHP ne lit que K, M ou G, et aurait pris la valeur en octets",
		EN: "memory_limit %s written as %s: PHP reads K, M or G alone, and would have taken the value in bytes",
	},
	"warn.github.logout.failed": {
		FR: "gh n'a pas pu se déconnecter, %s a été retiré avec le token qu'il tenait : %s",
		EN: "gh could not sign out, %s was removed with the token it held: %s",
	},
	"engine.uninstall.foreign": {
		FR: "%s n'a pas été installé par Pupitre",
		EN: "%s was not installed by Pupitre",
	},
	"engine.uninstall.foreign.fix": {
		FR: "Ce que vous avez installé vous-même se retire à la main ; installez %s depuis l'app pour que Pupitre le prenne en charge.",
		EN: "What you installed yourself is removed by hand; install %s from the app for Pupitre to take it over.",
	},
	"modules.download.checksum_mismatch": {
		FR: "le checksum SHA-256 de %s n'est pas celui publié : %s",
		EN: "the SHA-256 of %s is not the published one: %s",
	},
	"modules.download.checksum_missing": {
		FR: "sha256sum n'a rien dit de %s",
		EN: "sha256sum said nothing of %s",
	},
	"modules.download.version_unreadable": {
		FR: "%s ne renvoie vers aucune version : %q",
		EN: "%s points at no version: %q",
	},
	"modules.download.missing_after_extract": {
		FR: "%s est absent de %s après extraction",
		EN: "%s is missing from %s after extraction",
	},
	"modules.download.checksum_unpublished": {
		FR: "aucun checksum publié pour %s dans %s",
		EN: "no published checksum for %s in %s",
	},
	"apt.key.unpinned": {
		FR: "aucune empreinte épinglée pour la clé de dépôt %s : l'agent ne lui fait pas confiance",
		EN: "no pinned fingerprint for the repository key at %s: the agent does not trust it",
	},
	"apt.key.refused": {
		FR: "clé de dépôt refusée (%s) : %s",
		EN: "repository key refused (%s): %s",
	},
	"apt.repository.dropped": {
		FR: "apt ne lit pas ce dépôt : %s est retiré avec sa clé, et les autres installations gardent un apt utilisable",
		EN: "apt cannot read this repository: %s is taken back out with its key, so the other installs keep a working apt",
	},
	"apt.key.empty": {
		FR: "le fichier ne contient aucune clé",
		EN: "the file holds no key",
	},
	"apt.key.unexpected": {
		FR: "la clé %s n'est pas celle que l'éditeur publie",
		EN: "key %s is not one the vendor publishes",
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
	"modules.php.composer_missing": {
		FR: "PHP est installé mais composer ne répond pas",
		EN: "PHP is installed but composer does not answer",
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
		FR: "le checksum de Claude Code %s n'est pas celui du manifeste : %s",
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
