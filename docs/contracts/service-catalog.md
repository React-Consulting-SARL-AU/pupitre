# Catalogue de services

Le catalogue est une **bibliothèque des stacks les plus utilisées**, choisies parce qu'elles s'installent et se gèrent proprement. Il est complet : trente-huit modules, tous livrés. Il ne cherche pas l'exhaustivité : ce qui n'y est pas, le client l'installe lui-même sur sa machine, et Pupitre ne s'y oppose pas. La sonde signale ce qu'elle trouve, les modules ne touchent qu'à ce qu'ils ont installé.

Un service est un **module** de l'agent : une unité Go qui sait s'installer, se vérifier, se configurer, se mettre à jour, se désinstaller et rapporter son état, sur Ubuntu 22.04 et 24.04, amd64 et arm64. L'app ne connaît aucun service par son nom : elle affiche les manifestes que l'agent déclare.

## Manifeste

Types dans `packages/shared/src/catalog/`, exportés en JSON Schema pour Go.

```ts
type Manifest = {
  id: string                     // "db.postgres"
  category: "core" | "runtime" | "database" | "ai" | "editor" | "exposure" | "tool"
  name: string                   // "PostgreSQL 17"
  summary: string                // une phrase, pour la carte
  requires: string[]             // ids de modules
  conflicts: string[]            // ids de modules
  resources: { ram_mb: number; disk_mb: number }
  arch: ("amd64" | "arm64")[]
  fields: Field[]                // ce que l'écran de configuration demande
  connection?: ConnectionKind    // le compte tiers que ce module exige de l'app : `CONNECTION_KINDS` de `packages/shared` — cloudflare, wrangler, github, 1password, neon, vercel, supabase, stripe, backup
  runs: boolean                  // le module tient un processus, ou en lance un à tout moment
  mandatory: boolean             // true pour core.system et core.hardening
  since: string                  // version de l'agent
}

// Champs communs à tous les genres, en plus de `key`, `kind` et `label` :
//   help?      la phrase courte sous le contrôle, celle qui décide
//   hint?      { text, url? } — la forme longue, derrière une bulle
//   format?    "port" | "hostname" | "domain" | "email" | "identifier" | "path" | "timezone" | "size" | "url"
//   pattern?   une expression, quand aucun format ne convient
//   min_length? max_length?
//   managed?   dérivé d'une connexion par l'app : jamais saisi, jamais affiché
type Field =
  | { kind: "text" | "number" | "select"; required: boolean; default?: unknown; options?: string[]; min?: number; max?: number }  // min et max bornent un nombre, un port par exemple
  | { kind: "secret"; required: boolean; generate?: boolean }  // generate: proposé généré, jamais affiché
  | { kind: "version"; options: string[]; default: string }
  | { kind: "versions"; options: string[]; default: string[] }  // plusieurs majeures à la fois ; options de la plus récente à la plus ancienne, la plus récente cochée est le défaut de la machine
  | { kind: "boolean"; required: false; default: boolean }  // une case à cocher, jamais requise
  | { kind: "list"; required: boolean; items: "text" | "secret"; min?: number; max?: number }  // une liste de valeurs du même genre
```

**`runs` dit ce qui a un état à regarder.** Une base, un tunnel, un serveur d'éditeur, un agent de code tiennent un processus ou en lancent un à tout moment ; un langage, un CLI et la passe de durcissement ne laissent rien derrière eux. Le tableau de bord ne montre que les premiers — les autres vivent sur l'écran des services, où on les configure et les met à niveau. Une unité systemd n'est pas la règle : le durcissement en tient une et n'a rien à montrer. Un module antérieur au champ ne le rend pas, et l'app le tient alors pour un module qui tourne, ce que le tableau de bord faisait avant que le champ existe.

## Connexions

Une **connexion** est un compte tiers que l'app détient pour le client, sur son poste, et qui vaut pour tous ses serveurs. Un **module** est une unité que l'agent installe sur un serveur. Un module qui exige une connexion le déclare, et l'écran de configuration la demande au-dessus de ses propres questions plutôt que trois écrans plus loin.

Neuf connexions existent : **Cloudflare**, **Wrangler**, **GitHub**, **1Password**, **Neon**, **Vercel**, **Supabase**, **Stripe** et **Sauvegardes** (`backup`, un seau S3). L'app retient le jeton de chacune dans le trousseau système, un fichier par connexion, et le chiffré seul touche le disque. La connexion `backup` tient en plus la clé publique des sauvegardes et son sel, qui ne sont pas des secrets ; la phrase de passe dont ils viennent n'est gardée nulle part ([backups.md](./backups.md#le-chiffrement)).

Un jeton Cloudflare peut ouvrir plusieurs comptes. L'app n'agit que sur un — ses zones sont celles proposées pour un domaine, son tunnel celui qu'elle crée, son identifiant celui sur lequel Wrangler déploie — et ce compte est **choisi par le client** à la connexion quand il y en a plusieurs, jamais le premier que Cloudflare liste. `connections:connect` répond alors `{ status: "choose", accounts }` et rien n'est retenu tant que le jeton n'est pas renvoyé avec le compte choisi ; « Vérifier » pèse ensuite le jeton sur ce compte-là, et refuse un jeton qui ne l'ouvre plus.

Cloudflare et Wrangler ouvrent le même compte avec deux jetons, parce qu'ils ne vivent pas au même endroit : le premier crée le tunnel et écrit le DNS depuis le poste et n'atteint jamais le serveur ; le second est exporté dans le shell de `dev` pour Wrangler, là où tournent les agents et les projets du client. Un seul jeton pour les deux déposerait les droits sur le domaine du client là où il les expose le plus. Chacun ne porte que ses permissions : Tunnel et DNS pour l'un, Workers et ce que le serveur déploie pour l'autre.

| Connexion | Vérifiée à la saisie | Ce qu'elle remplit |
| --- | --- | --- |
| `cloudflare` | `GET /accounts` : le compte qu'ouvre le jeton, et les zones qu'il porte. Un jeton sans `Account Settings · Read` est accepté mais ne liste aucun compte : le refus nomme cette permission | les trois champs `managed` d'`exposure.cloudflare` — `account_tag`, `tunnel_id`, `tunnel_secret` |
| `wrangler` | `GET /accounts` : le compte qu'ouvre le jeton, même exigence | les deux champs `managed` de `tool.wrangler` — `api_token`, `account_id` |
| `github` | `GET /user` : le compte qu'ouvre le jeton | le champ `managed` `token` de `tool.github` |
| `1password` | rien : un jeton de compte de service ne répond à aucun appel depuis le poste. Il est retenu sans nom, et le serveur dit à l'installation s'il ouvre un coffre | le champ `managed` `service_account_token` de `tool.1password` |
| `neon` | `GET /users/me` : le compte qu'ouvre la clé | le champ `managed` `api_key` de `tool.neon` |
| `backup` | le seau, depuis le poste ([backups.md](./backups.md#lapp)) ; le serveur le sonde à son tour à l'installation (`verify-bucket`) | les neuf champs `managed` de `core.backup` — `endpoint`, `region`, `bucket`, `prefix`, `path_style`, `access_key_id`, `secret_access_key`, `recipient`, `kdf_salt` |

**Rien ne change sur le fil** pour un jeton passé d'un formulaire à une connexion. Il atteint la machine sur la ligne de secrets de l'`install`, groupé par identifiant de module comme les autres, écrit par le processus principal de l'app, et se range dans `/etc/pupitre/env` sous root seul. Un jeton qu'un CLI lit lui-même dans son environnement (`NEON_API_KEY`, `OP_SERVICE_ACCOUNT_TOKEN`, `CLOUDFLARE_API_TOKEN`) est aussi exporté dans `/home/dev/.config/pupitre/env`, 0600 sous `dev`, que `~/.zshenv` lit : sans quoi `neon me`, `op whoami` ou `wrangler whoami` dans un terminal ne voient aucun compte. Ce qui change est d'où l'app le tient : un compte connecté une fois, au lieu d'un champ retapé pour chaque serveur. Un module dont le compte n'est pas connecté est refusé **avant la première étape**, avec le problème `connection`.

- **Un champ `managed` est dérivé d'une connexion par l'app, jamais par la plateforme.** L'agent refuse d'enregistrer un manifeste qui en porte un sans déclarer de connexion. Un champ `managed` de genre `secret` reçoit le jeton de la connexion ; un champ `managed` de genre `text` reçoit l'identifiant du compte que ce jeton ouvre — `account_id` de `tool.wrangler`, comme `account_tag` d'`exposure.cloudflare`, que le tunnel dérive lui-même.
- **Le tunnel appartient au serveur.** L'app le crée une fois sur le compte du client, en pousse l'identifiant et le secret, puis n'en garde rien : `module.config` le lui rend quand elle en a besoin. Un poste réinstallé, ou un serveur confié à un collègue, retrouve le tunnel avec le seul jeton du compte.
- **Le domaine est un champ ordinaire**, requis, de format `domain`, choisi par serveur. La zone se déduit du domaine ; l'écran propose les zones du compte pour le préremplir.

## Validation

Les contraintes vivent dans le manifeste, et les deux côtés les appliquent avec le même code. `packages/shared/src/catalog/validate.ts` et `apps/agent/internal/contract/fields.go` sont vérifiés contre un même jeu de cas, `validate.fixtures.json`, exporté vers l'agent par `contracts:export`.

Une valeur hors contrainte est **refusée**, jamais remplacée par le défaut. Un champ absent prend le défaut du manifeste, exactement comme le module le lira.

```ts
type FieldProblem = {
  module: string
  field: string        // vide quand le problème est celui du module : une connexion manquante
  code: "required" | "type" | "min" | "max" | "min_length" | "max_length"
      | "options" | "format" | "pattern" | "connection"
  expected?: string    // les bornes, la liste des options, le nom du format
  message?: string     // rempli par l'agent, dans la langue de la session
}
```

`install` valide tout **avant sa première étape** : un refus est `invalid_config`, avec la liste complète dans son remède `invalid_fields`, et rien n'est touché sur la machine. Un module ne vérifie donc plus ses propres champs.

`install.check` rejoue cette validation sans rien installer, et y ajoute ce que seule la machine sait : un port déjà écouté, un dossier qui est un fichier, un fuseau que ce noyau ignore. Elle ne juge jamais un secret — l'app tient son coffre et l'écrira au moment de l'installation.

Un `preset` porte un `id`, un `name` affichable et sa liste de modules : l'app montre le nom que l'agent donne, sans table de traduction. Son `choose_one` optionnel nomme des modules exclusifs entre lesquels l'écran fait choisir avant d'appliquer le préréglage.

## Étapes

Chaque module implémente `Check`, `Install`, `Configure`, `Upgrade`, `Uninstall`, `Status`. Chaque étape est idempotente : elle vérifie avant d'agir, et l'installation entière peut être rejouée sans dégât. Une étape émet des événements `step` avec sa durée ; une étape qui échoue n'arrête pas les autres modules, elle est notée avec sa commande de rejeu.

## Compte d'un CLI

Un module dont le CLI se connecte à un compte implémente en plus `Login` : il pose au CLI sa propre question — `gh auth status`, `claude auth status`, `codex login status`, `cursor-agent status`, `opencode auth list`, `neonctl me`, `op whoami`, `wrangler whoami`, `code tunnel user show` — et rend un `login` d'après [agent-protocol.md](./agent-protocol.md#compte-dun-cli). Le CLI est le seul juge : l'agent ne lit jamais un fichier d'identifiants pour deviner. Un CLI qui prend sa clé dans l'environnement n'est interrogé qu'avec elle — sans clé, `neonctl` ouvrirait une connexion par navigateur que personne ne regarde, et attendrait — et un CLI qui n'a rien à ouvrir sur cette machine, le tunnel de `editor.vscode` qu'on n'a pas demandé, ne rend rien.

| Module | Commande | Compte rendu |
| --- | --- | --- |
| `ai.claude` | `claude auth status` | l'email, sinon le nom de l'organisation |
| `ai.codex` | `codex login status` | l'email du jeton d'identité que la connexion ChatGPT a laissé ; vide pour une clé d'API |
| `ai.cursor` | `cursor-agent status --format json` | l'email que Cursor rend ; vide quand il ne le donne pas |
| `ai.gemini` | — | Gemini CLI n'a pas de commande qui réponde sans dépenser une requête : rien n'est rendu |
| `ai.copilot` | — | même chose pour le CLI de Copilot |
| `ai.opencode` | `opencode auth list` | les fournisseurs qui tiennent une clé ou un jeton, séparés par des virgules ; déconnecté quand il n'y en a aucun — OpenCode marche alors sur ses modèles gratuits |
| `tool.github` | `gh auth status --active --json hosts` | le login |
| `tool.1password` | `op whoami --format=json` | l'email, sinon l'adresse du compte — un compte de service n'en a pas |
| `tool.neon` | `neonctl me -o json` | l'email, sinon le login |
| `tool.wrangler` | `wrangler whoami --json` | l'email, sinon le nom du compte de la connexion |
| `tool.vercel` | `vercel whoami` | le nom d'utilisateur que le jeton ouvre |
| `tool.supabase` | `supabase orgs list -o json` | les organisations que le jeton ouvre, séparées par des virgules — le CLI ne nomme pas la personne |
| `tool.stripe` | `stripe get /v1/account` | le nom que le tableau de bord affiche, sinon l'identifiant du compte |
| `exposure.tailscale` | `tailscale status --json` | le login qui possède le nœud, sinon son nom DNS sur le tailnet ; déconnecté quand le nœud n'est sur aucun tailnet |
| `editor.vscode` | `code tunnel user show`, quand le tunnel est demandé | le fournisseur — `github`, `microsoft` — le CLI ne nomme pas le compte |

## Modules

### Socle

`core.system` et `core.hardening` sont obligatoires ; `core.backup` est facultatif.

| Id | Fait | Champs |
| --- | --- | --- |
| `core.system` | paquets de base — dont `rsync`, que l'app emploie pour transférer des fichiers avec reprise ; une machine installée avant lui le reçoit à la mise à niveau suivante des modules — fuseau, mises à jour de sécurité automatiques sans redémarrage, swap dimensionné, garde-fou mémoire (`systemd-oomd` ou `earlyoom`), utilisateur `dev` avec sudo, dont `authorized_keys` reçoit les clés non restreintes de root pour qu'une clé l'ouvre avant le durcissement, tmux, zsh et bash avec les marqueurs de prompt (OSC 133) lus par l'app, commande `dev` liée au binaire, identité git | `timezone`, `git_name`, `git_email`, `projects_dir` |
| `core.hardening` | ufw sur SSH seul (22, et 443 en option), fail2ban, root fermé et mots de passe désactivés **après** vérification qu'une clé ouvre `dev`, `AllowUsers dev`, `ClientAlive`. Avec `keep_root`, root garde sa place dans `AllowUsers` et passe en `PermitRootLogin prohibit-password` : par clé, jamais par mot de passe | `ssh_443` (boolean), `keep_root` (boolean) |
| `core.backup` | rien sur la machine hormis ses valeurs dans `install.json` : l'installation sonde le seau (`verify-bucket`), le daemon sauvegarde à l'échéance, chiffré pour la clé publique du client ; désinstallé, il ne planifie plus rien et laisse le seau tel qu'il est. Tout part par défaut : les réglages nomment ce qui reste dehors, projet par projet et base par base, et `backup.contents` rend la liste à cocher. Voir [backups.md](./backups.md) | `endpoint` (text, HTTPS seulement, motif `BACKUP_ENDPOINT_PATTERN`), `region`, `bucket` (motifs S3), `prefix`, `path_style` (boolean), `access_key_id`, `secret_access_key` (secret), `recipient`, `kdf_salt` — tous `managed` par la connexion `backup` — ; `interval_hours` (0–720), `hour` (0–23), `keep` (1–365), `databases`, `home`, `projects`, `projects_env_only` (boolean), `extra_paths` (list de text), `exclude_projects` (list de text, motif `BACKUP_PROJECT_ITEM_PATTERN`), `exclude_databases` (list de text, motif `BACKUP_DATABASE_ITEM_PATTERN` : `postgres:shop`, `redis:*`) |

### Runtimes

| Id | Fait | Champs |
| --- | --- | --- |
| `runtime.node` | mise ; Node aux majeures cochées (24 par défaut, la LTS active), Bun, pnpm, Yarn ; pnpm et Yarn par corepack ; activés dans tous les shells y compris non interactifs par un bloc balisé du `.zshenv` | `node_versions` (versions), `bun` (boolean), `pnpm` (boolean), `yarn` (boolean, décoché) |
| `runtime.java` | Temurin via mise aux majeures cochées, `JAVA_HOME` résolu par mise à l'ouverture de chaque shell — donc celui du projet quand il en épingle une —, daemon Gradle dimensionné pour la RAM | `java_versions` (versions) |
| `runtime.python` | uv et Python aux versions cochées ; base des agents en Python | `python_versions` (versions) |
| `runtime.go` | Go via mise aux versions cochées, `GOPATH` et son `bin` sur le `PATH` | `go_versions` (versions), `gopath` |
| `runtime.php` | dépendances de compilation, PHP compilé par mise aux versions cochées, Composer en option, un `php.ini` lu après celui de la compilation | `php_versions` (versions), `composer` (boolean), `memory_limit` |
| `runtime.ruby` | dépendances de compilation, Ruby compilé par mise aux versions cochées, Bundler rafraîchi sous chaque interpréteur qui vient d'être posé | `ruby_versions` (versions), `bundler` (boolean) |
| `runtime.docker` | Docker Engine et Compose depuis le dépôt de Docker, `dev` dans le groupe `docker`, rotation des logs de conteneurs, `live-restore` pour qu'un redémarrage du démon ne coupe aucun conteneur | `compose` (boolean), `data_root`, `log_max_size` |
| `runtime.rust` | Rust via mise, qui pose rustup et les toolchains cochées ; `~/.cargo/bin` sur le PATH de tous les shells | `rust_versions` (versions) |

### Bases de données

| Id | Fait | Champs |
| --- | --- | --- |
| `db.mysql` | MySQL 8 ou MariaDB, lié à `127.0.0.1` sur le port choisi, root sur socket, compte applicatif, compte distant pour le laptop à travers SSH, buffer pool dimensionné, import automatique des dumps déposés dans `~/dumps/` | `engine: mysql \| mariadb`, `port`, `app_user`, `remote_user`, `app_password` (généré), `remote_password` (généré), `buffer_pool` |
| `db.postgres` | PostgreSQL à la version majeure choisie depuis le dépôt du projet, local seulement, rôles applicatif et distant, mémoire partagée dimensionnée, extensions courantes, import de dumps | `version`, `port`, `app_role`, `remote_role`, `app_password`, `remote_password`, `shared_buffers` |
| `db.mongodb` | MongoDB à la version majeure choisie, local seulement, utilisateur applicatif, cache WiredTiger dimensionné, import de `mongodump` | `version`, `port`, `app_user`, `app_password`, `cache_mb` |
| `db.redis` | local seulement, mot de passe exigé, persistance, plafond mémoire et politique d'éviction au choix ; un rejeu qui change tout sauf le port passe par `CONFIG SET` sur le serveur qui tourne, sans redémarrage — un cache sans persistance garde ce qu'il tient | `port`, `password`, `persistence` (boolean), `maxmemory_mb`, `maxmemory_policy` |
| `db.mailpit` | Mailpit, binaire de la release GitHub vérifié par le digest que GitHub publie, en service systemd `pupitre-mailpit` sous `dev` : SMTP et interface sur la boucle locale, messages dans `~/.local/share/mailpit` ; aucune commande `db.*`, ce n'est pas un moteur | `smtp_port`, `http_port` |

### Agents IA

| Id | Fait | Champs |
| --- | --- | --- |
| `ai.claude` | Claude Code, connexion par l'URL affichée dans le terminal de l'app, contexte du projet, skills Pupitre (capture, branche, PR, ship) | — |
| `ai.codex` | Codex, idem | — |
| `ai.cursor` | Cursor CLI (`cursor-agent`), archive de Cursor sous `~/.local/share/cursor-agent/versions`, liens `agent` et `cursor-agent` dans `~/.local/bin`, skills Pupitre dans `~/.cursor/skills` ; pas de contexte machine, Cursor n'a pas de fichier de règles global | — |
| `ai.gemini` | Gemini CLI via mise, contexte machine dans `~/.gemini/GEMINI.md`, skills Pupitre dans `~/.gemini/skills` | — |
| `ai.copilot` | GitHub Copilot CLI via mise, contexte machine dans `~/.copilot/copilot-instructions.md`, skills Pupitre dans `~/.copilot/skills` | — |
| `ai.opencode` | OpenCode, binaire de la release GitHub vérifié par la somme que GitHub publie, `~/.local/bin/opencode`, contexte machine dans `~/.config/opencode/AGENTS.md`, skills Pupitre | — |
| `ai.hermes` | Hermes Agent (Nous Research) via Python, configuration des fournisseurs de modèles, service systemd si toujours actif, redémarré quand une clé change | `providers` (list de secrets), `always_on` (boolean) |
| `ai.openclaw` | OpenClaw via mise sur le Node de `runtime.node` (24.16 ou plus, vérifié avant l'installation), fournisseurs de modèles dans `~/.openclaw/providers.env` sous les noms que la passerelle lit, passerelle `openclaw gateway` en service systemd `pupitre-openclaw` sur 127.0.0.1:18789 si toujours active — redémarrée quand une clé change —, skills Pupitre ; les canaux se branchent par `openclaw onboard` dans un terminal | `providers` (list de secrets), `always_on` (boolean) |
| `ai.browser` | Chrome headless, dépendances Playwright, commande de capture qui range les images dans la galerie | — |

### Éditeurs distants

| Id | Fait | Champs |
| --- | --- | --- |
| `editor.jetbrains` | backend de développement distant préinstallé dans le cache attendu par JetBrains Gateway, JVM et mémoire dimensionnées ; le service rend son dossier dans `path` et l'app ouvre par le lien Gateway (`idePath`, `deploy=false`) ; licence du client | `ide: idea \| webstorm \| pycharm \| phpstorm \| goland`, `version` |
| `editor.vscode` | CLI `code` et serveur distant préinstallés pour que la première connexion Remote SSH soit immédiate, extensions de base, Remote Tunnel en option ; un rejeu garde le serveur enregistré, seul `upgrade` prend la version suivante ; même mécanisme pour Cursor et Windsurf | `extensions` (list de text), `tunnel` (boolean) |
| `editor.zed` | serveur distant Zed préinstallé pour la version du client ; en `latest`, un rejeu garde la version posée et seul `upgrade` prend la suivante ; ouverture par `zed://ssh` | `version` |

Visual Studio n'a pas de backend Linux : l'app le dit et renvoie vers `editor.vscode`.

### Exposition

Caddy et le tunnel sont exclusifs : chacun déclare l'autre en `conflicts`. Tailscale est une exposition aussi, mais privée — le tailnet du client, rien de publié — et cohabite avec l'un ou l'autre. Ne cocher ni Caddy ni le tunnel est le troisième état, et il ne porte pas de module : la machine répond par la session SSH que l'app tient déjà, et rien n'est publié. Les commandes `tunnel.status`, `tunnel.sync` et `tunnel.restart` s'adressent à celui qui est installé, jamais à un fournisseur nommé — `/etc/pupitre/exposure` dit lequel tient la machine, et le rapport le nomme dans `provider`. Une machine que rien n'expose répond `absent` avec `provider: null` ; `tunnel.sync` et `tunnel.restart` y refusent en `service_not_found` plutôt que de répondre pour un module absent.

| Id | Fait | Champs |
| --- | --- | --- |
| `exposure.cloudflare` | un tunnel, une route par projet, DNS et certificat gérés, sous-domaines depuis le registre, sur le compte Cloudflare du client. **L'app tient le jeton** : elle crée le tunnel et écrit le DNS depuis le laptop, le serveur ne reçoit que de quoi le faire tourner, et le garde | `domain`, choisi par serveur ; trois champs `managed` dérivés de la connexion : `account_tag`, `tunnel_id`, `tunnel_secret` |
| `exposure.caddy` | reverse proxy avec certificats Let's Encrypt automatiques pour un domaine sans Cloudflare, une route par projet qui déclare un sous-domaine, ses deux ports ouverts dans ufw sous la forme `<port>/tcp` avec le commentaire `caddy`, lus par `ufw show added` (le pare-feu peut ne pas être levé encore) ; un port déplacé ferme l'ancienne règle sur le même passage | `domain`, `email`, `http_port`, `https_port` |
| `exposure.tailscale` | Tailscale depuis le dépôt de l'éditeur, le nœud joint au tailnet par `tailscale up --auth-key` (la clé masquée dans le journal), `ufw allow in on tailscale0` ; sur un nœud déjà joint, `hostname` et `ssh` changés passent par `tailscale set`, sans seconde clé ; ne contredit ni Caddy ni le tunnel, le preset « tout » l'inclut ; la désinstallation fait `tailscale logout` avant de reprendre le paquet | `auth_key` (secret, tapé : une clé de la console Tailscale, pas une connexion), `hostname`, `ssh` (boolean) |

`core.hardening` gouverne les règles nues `22` et `443` — SSH — et n'y touche jamais autrement ; `exposure.caddy` écrit les siennes en `<port>/tcp`. Les deux ne se marchent pas dessus.

Le `domain` des deux modules se choisit parmi les zones du compte connecté quand c'est Cloudflare, et se change après coup depuis l'écran du service : la première étape de `Configure`, `move-routes`, porte alors chaque nom du registre de l'ancien domaine au nouveau avant que le domaine soit enregistré et l'ingress ou le Caddyfile réécrit ([agent-protocol.md](./agent-protocol.md#un-projet-une-commande-plusieurs-ports)). Les enregistrements DNS suivent depuis l'app, qui ne retire que ceux qu'elle a écrits.

### Outils

| Id | Fait | Champs |
| --- | --- | --- |
| `tool.github` | `gh`, clone HTTPS sans clé, clé du serveur enregistrée sur le compte ; un jeton tourné reconnecte `gh` | `token` (secret, `managed` par la connexion `github`) |
| `tool.1password` | CLI et compte de service, `OP_SERVICE_ACCOUNT_TOKEN` exporté dans le shell de `dev`, coffres vérifiés à chaque jeton nouveau seulement, génération des `.env.local` depuis les gabarits des dépôts | `service_account_token` (secret, `managed` par la connexion `1password`) |
| `tool.neon` | le CLI Neon dans `/usr/local/bin/neon`, `neonctl` en lien vers lui (c'est le nom que son aide imprime), et la clé rangée dans `/etc/pupitre/env` puis exportée dans le shell de `dev` — `neonctl` n'a pas de connexion par jeton, il la prend par `NEON_API_KEY`, et sans elle il lance une connexion par navigateur ; les projets et les bases restent la décision du client | `api_key` (secret, `managed` par la connexion `neon`) |
| `tool.vercel` | le CLI Vercel posé par mise (`npm:vercel`) sur le Node de `runtime.node` ; le jeton rangé dans `/etc/pupitre/env` puis exporté dans le shell de `dev` en `VERCEL_TOKEN`, que le CLI lit lui-même | `token` (secret, `managed` par la connexion `vercel`) |
| `tool.supabase` | le CLI Supabase dans `/usr/local/bin/supabase`, binaire de la release GitHub vérifié par `checksums.txt`, version enregistrée sous `/var/lib/pupitre/versions` ; le jeton rangé puis exporté en `SUPABASE_ACCESS_TOKEN` | `access_token` (secret, `managed` par la connexion `supabase`) |
| `tool.stripe` | le CLI Stripe dans `/usr/local/bin/stripe`, binaire de la release GitHub vérifié par `stripe-linux-checksums.txt` ; la clé rangée puis exportée en `STRIPE_API_KEY` — une clé restreinte de test, jamais la clé secrète de production | `api_key` (secret, `managed` par la connexion `stripe`) |
| `tool.wrangler` | Wrangler, le CLI de Cloudflare, posé par mise (`npm:wrangler`) sur le Node de `runtime.node` ; le jeton et l'identifiant du compte rangés dans `/etc/pupitre/env` puis exportés dans le shell de `dev` en `CLOUDFLARE_API_TOKEN` et `CLOUDFLARE_ACCOUNT_ID`, que Wrangler lit lui-même — pas de `wrangler login`, et un jeton qui ouvre plusieurs comptes déploie sur celui de la connexion ; les Workers, les bases D1 et les Pages restent la décision du client | `api_token` (secret, `managed` par la connexion `wrangler`), `account_id` (text, `managed` par la même connexion) |

## Préréglages

| Preset | Nom | Modules |
| --- | --- | --- |
| `web-js` | Web JavaScript | `core.*`, `runtime.node`, `db.mysql`, `ai.claude`, `ai.browser`, `editor.vscode` — aucune exposition, qui est l'état par défaut |
| `full` | Tout le catalogue | tout le catalogue moins Caddy et le tunnel, qui se contredisent : le préréglage porte les deux en `choose_one` et l'écran demande laquelle ; Tailscale, qui ne contredit rien, en fait partie |
| `minimal` | Minimal | `core.*`, un agent au choix |

Les identifiants de modules d'un préréglage suivent la même forme ouverte que celui d'un manifeste : un module que l'agent gagne avant que `packages/shared` ne le connaisse peut entrer dans un préréglage sans version de ce paquet.

## Source des étapes

`server/bootstrap.sh` et `server/bin/dev` décrivent, en bash et zsh, ce que chaque module reproduit : ordre, options apt (`DPkg::Lock::Timeout`), fermeture de root en dernier, rapport de fin, commandes de pilotage. Les agents lisent ces fichiers comme une spécification, pas comme du code à appeler.

### Ce que le client choisit

Un module demande au client tout ce qu'il pourrait vouloir décider, et rien de plus : la **version** quand plusieurs sont posables — un runtime par mise, une base dont le dépôt en publie plusieurs ; le **port** quand un service écoute ; les **noms des comptes** que le module crée pour lui. Chaque champ porte un `default` qui vaut le choix par défaut, si bien qu'un client qui ne touche à rien obtient la même machine qu'avant.

Un nom de compte et une version traversent un fichier de configuration ou une requête SQL : le manifeste les tient à un `format`, et une valeur qui n'y répond pas est **refusée avant la première étape**, avec le champ nommé. Rien ne retombe en silence sur le défaut : un client qui tape `my-app` obtiendrait `app` sans jamais l'apprendre.

Redis fait exception à la version : le module pose le paquet d'Ubuntu, et n'ajoute pas un dépôt de plus pour un choix que personne n'a demandé.

### Un runtime tient plusieurs versions à la fois

Un langage se choisit en `versions`, pas en `version` : plusieurs projets d'une même machine ne tournent pas tous sur le même Java ni le même Node. Le champ est une liste fermée à plusieurs cases, `options` de la plus récente à la plus ancienne, une cochée au moins. L'agent pose chaque majeure cochée (`install-<outil>-<majeure>`, par `mise install`), fait de **la plus récente cochée le défaut de la machine** (`use-<outil>`, par `mise use -g`) — ce que rend un shell hors de tout projet, et ce qu'obtient un projet qui ne dit rien — et retire ce qui n'est plus coché (`prune-<outil>`). `upgrade` porte chaque majeure à son dernier patch et retire celui qu'il remplace. Le service rend `versions[]`, les majeures que la machine tient réellement, de la plus récente à la plus ancienne : c'est là qu'un projet choisit. Les outils partagés — mise, `~/.config/mise/config.toml` — restent quand un runtime part ; les autres s'en servent.

Le choix d'un projet est l'affaire du protocole (`runtimes` sur `project.add` et `project.update`) : l'agent écrit un `mise.local.toml` à la racine du projet, que mise lit avant tout ce que le dépôt déclare, pour ses processus comme pour les terminaux ouverts dedans. Ce que le client tape à la main dans son propre `mise.toml` ou `.tool-versions` vaut pour les projets qui n'épinglent rien, tant que la version demandée est posée.

### Le champ `version` des éditeurs reste du texte libre

Les modules d'éditeurs distants exposent `version` en `text`, avec `latest` par défaut, et non le genre `version` à liste fermée. Aucune liste ne tiendrait : le serveur distant de Zed doit correspondre exactement à la version du client installé sur le laptop, et un backend JetBrains à celle du Gateway. Une liste d'options serait fausse le jour de la première mise à jour de l'éditeur, côté client, sans que nous en sachions rien.
