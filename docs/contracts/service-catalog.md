# Catalogue de services

Le catalogue est une **bibliothèque des stacks les plus utilisées**, choisies parce qu'elles s'installent et se gèrent proprement. Il est complet : vingt-six modules, tous livrés. Il ne cherche pas l'exhaustivité : ce qui n'y est pas, le client l'installe lui-même sur sa machine, et Pupitre ne s'y oppose pas. La sonde signale ce qu'elle trouve, les modules ne touchent qu'à ce qu'ils ont installé.

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
  provides: string[]             // "db:postgres", "editor:jetbrains" — pour les préréglages et les projets
  connection?: "cloudflare"      // le compte tiers que ce module exige de l'app
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
  | { kind: "boolean"; required: false; default: boolean }  // une case à cocher, jamais requise
  | { kind: "list"; required: boolean; items: "text" | "secret"; min?: number; max?: number }  // une liste de valeurs du même genre
```

## Connexions

Une **connexion** est un compte tiers que l'app détient pour le client, sur son poste, et qui vaut pour tous ses serveurs. Un **module** est une unité que l'agent installe sur un serveur. Un module qui exige une connexion le déclare, et l'écran de configuration la demande au-dessus de ses propres questions plutôt que trois écrans plus loin.

Une seule connexion existe : **Cloudflare**. L'app en retient le jeton, dans le trousseau système ; elle lit auprès de Cloudflare le compte qu'il ouvre, et ne demande donc aucun identifiant. Elle en dérive les trois champs `managed` de `exposure.cloudflare` — `account_tag`, `tunnel_id`, `tunnel_secret` — au moment de l'installation.

- **Un champ `managed` est dérivé d'une connexion par l'app, jamais par la plateforme.** L'agent refuse d'enregistrer un manifeste qui en porte un sans déclarer de connexion.
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

## Modules

### Socle — obligatoires

| Id | Fait | Champs |
| --- | --- | --- |
| `core.system` | paquets de base, fuseau, mises à jour de sécurité automatiques sans redémarrage, swap dimensionné, garde-fou mémoire (`systemd-oomd` ou `earlyoom`), utilisateur `dev` avec sudo, dont `authorized_keys` reçoit les clés non restreintes de root pour qu'une clé l'ouvre avant le durcissement, tmux, zsh et bash avec les marqueurs de prompt (OSC 133) lus par l'app, commande `dev` liée au binaire, identité git | `timezone`, `git_name`, `git_email`, `projects_dir` |
| `core.hardening` | ufw sur SSH seul (22, et 443 en option), fail2ban, root fermé et mots de passe désactivés **après** vérification qu'une clé ouvre `dev`, `AllowUsers dev`, `ClientAlive`. Avec `keep_root`, root garde sa place dans `AllowUsers` et passe en `PermitRootLogin prohibit-password` : par clé, jamais par mot de passe | `ssh_443` (boolean), `keep_root` (boolean) |

### Runtimes

| Id | Fait | Champs |
| --- | --- | --- |
| `runtime.node` | mise ; Node, Bun, pnpm aux versions choisies ; activés dans tous les shells y compris non interactifs par un bloc balisé du `.zshenv` | `node_version`, `bun` (boolean), `pnpm` (boolean) |
| `runtime.java` | Temurin via mise, daemon Gradle dimensionné pour la RAM | `java_version` |
| `runtime.python` | uv et une version Python ; base des agents en Python | `python_version` |
| `runtime.go` | Go via mise, `GOPATH` et son `bin` sur le `PATH` | `go_version`, `gopath` |
| `runtime.php` | dépendances de compilation, PHP compilé par mise, Composer en option, un `php.ini` lu après celui de la compilation | `php_version`, `composer` (boolean), `memory_limit` |
| `runtime.ruby` | dépendances de compilation, Ruby compilé par mise, Bundler rafraîchi quand l'interpréteur vient d'être posé | `ruby_version`, `bundler` (boolean) |
| `runtime.docker` | Docker Engine et Compose depuis le dépôt de Docker, `dev` dans le groupe `docker`, rotation des logs de conteneurs | `compose` (boolean), `data_root`, `log_max_size` |

### Bases de données

| Id | Fait | Champs |
| --- | --- | --- |
| `db.mysql` | MySQL 8 ou MariaDB, lié à `127.0.0.1` sur le port choisi, root sur socket, compte applicatif, compte distant pour le laptop à travers SSH, buffer pool dimensionné, import automatique des dumps déposés dans `~/dumps/` | `engine: mysql \| mariadb`, `port`, `app_user`, `remote_user`, `app_password` (généré), `remote_password` (généré), `buffer_pool` |
| `db.postgres` | PostgreSQL à la version majeure choisie depuis le dépôt du projet, local seulement, rôles applicatif et distant, extensions courantes, import de dumps | `version`, `port`, `app_role`, `remote_role`, `app_password`, `remote_password` |
| `db.mongodb` | MongoDB à la version majeure choisie, local seulement, utilisateur applicatif, import de `mongodump` | `version`, `port`, `app_user`, `app_password` |
| `db.redis` | local seulement, mot de passe exigé, persistance et plafond mémoire au choix | `port`, `password`, `persistence` (boolean), `maxmemory_mb` |

### Agents IA

| Id | Fait | Champs |
| --- | --- | --- |
| `ai.claude` | Claude Code, connexion par l'URL affichée dans le terminal de l'app, contexte du projet, skills Pupitre (capture, branche, PR, ship) | — |
| `ai.codex` | Codex, idem | — |
| `ai.hermes` | Hermes Agent (Nous Research) via Python, configuration des fournisseurs de modèles, service systemd si toujours actif | `providers` (list de secrets), `always_on` (boolean) |
| `ai.browser` | Chrome headless, dépendances Playwright, commande de capture qui range les images dans la galerie | — |

### Éditeurs distants

| Id | Fait | Champs |
| --- | --- | --- |
| `editor.jetbrains` | backend de développement distant préinstallé dans le cache attendu par JetBrains Gateway, JVM et mémoire dimensionnées ; l'app ouvre par le lien Gateway ; licence du client | `ide: idea \| webstorm \| pycharm \| phpstorm \| goland`, `version` |
| `editor.vscode` | CLI `code` et serveur distant préinstallés pour que la première connexion Remote SSH soit immédiate, extensions de base, Remote Tunnel en option ; même mécanisme pour Cursor et Windsurf | `extensions` (list de text), `tunnel` (boolean) |
| `editor.zed` | serveur distant Zed préinstallé pour la version du client ; ouverture par `zed://ssh` | `version` |

Visual Studio n'a pas de backend Linux : l'app le dit et renvoie vers `editor.vscode`.

### Exposition

Les trois modules d'exposition sont exclusifs : chacun déclare les deux autres en `conflicts`. Les commandes `tunnel.status`, `tunnel.sync` et `tunnel.restart` s'adressent à celui qui est installé, jamais à un fournisseur nommé — `/etc/pupitre/exposure` dit lequel tient la machine, et le rapport le nomme dans `provider`. Une machine que rien n'expose répond `absent` avec `provider: null` ; `tunnel.sync` et `tunnel.restart` y refusent en `service_not_found` plutôt que de répondre pour un module absent.

| Id | Fait | Champs |
| --- | --- | --- |
| `exposure.cloudflare` | un tunnel, une route par projet, DNS et certificat gérés, sous-domaines depuis le registre, sur le compte Cloudflare du client. **L'app tient le jeton** : elle crée le tunnel et écrit le DNS depuis le laptop, le serveur ne reçoit que de quoi le faire tourner, et le garde | `domain`, choisi par serveur ; trois champs `managed` dérivés de la connexion : `account_tag`, `tunnel_id`, `tunnel_secret` |
| `exposure.ssh` | sans exposition publique : chaque projet sur son port, à travers la session SSH que l'app tient | — |
| `exposure.caddy` | reverse proxy avec certificats Let's Encrypt automatiques pour un domaine sans Cloudflare, une route par projet qui déclare un sous-domaine, ses deux ports ouverts dans ufw sous la forme `<port>/tcp` | `domain`, `email`, `http_port`, `https_port` |

`core.hardening` gouverne les règles nues `22` et `443` — SSH — et n'y touche jamais autrement ; `exposure.caddy` écrit les siennes en `<port>/tcp`. Les deux ne se marchent pas dessus.

### Outils

| Id | Fait | Champs |
| --- | --- | --- |
| `tool.github` | `gh`, clone HTTPS sans clé, clé du serveur enregistrée sur le compte | `token` (secret) |
| `tool.1password` | CLI et compte de service, génération des `.env.local` depuis les gabarits des dépôts | `service_account_token` (secret) |
| `tool.neon` | le CLI Neon dans `/usr/local/bin/neon`, authentifié par la clé rangée dans `/etc/pupitre/env` ; les projets et les bases restent la décision du client | `api_key` (secret) |

## Préréglages

| Preset | Nom | Modules |
| --- | --- | --- |
| `web-js` | Web JavaScript | `core.*`, `runtime.node`, `db.mysql`, `ai.claude`, `ai.browser`, `editor.vscode`, `exposure.ssh` |
| `full` | Tout le catalogue | tout le catalogue moins les expositions, qui se contredisent : le préréglage porte les trois en `choose_one` et l'écran demande laquelle |
| `minimal` | Minimal | `core.*`, un agent au choix |

## Source des étapes

`server/bootstrap.sh` et `server/bin/dev` décrivent, en bash et zsh, ce que chaque module reproduit : ordre, options apt (`DPkg::Lock::Timeout`), fermeture de root en dernier, rapport de fin, commandes de pilotage. Les agents lisent ces fichiers comme une spécification, pas comme du code à appeler.

### Ce que le client choisit

Un module demande au client tout ce qu'il pourrait vouloir décider, et rien de plus : la **version** quand plusieurs sont posables — un runtime par mise, une base dont le dépôt en publie plusieurs ; le **port** quand un service écoute ; les **noms des comptes** que le module crée pour lui. Chaque champ porte un `default` qui vaut le choix par défaut, si bien qu'un client qui ne touche à rien obtient la même machine qu'avant.

Un nom de compte et une version traversent un fichier de configuration ou une requête SQL : le manifeste les tient à un `format`, et une valeur qui n'y répond pas est **refusée avant la première étape**, avec le champ nommé. Rien ne retombe en silence sur le défaut : un client qui tape `my-app` obtiendrait `app` sans jamais l'apprendre.

Redis fait exception à la version : le module pose le paquet d'Ubuntu, et n'ajoute pas un dépôt de plus pour un choix que personne n'a demandé.

### Le champ `version` des éditeurs reste du texte libre

Les modules d'éditeurs distants exposent `version` en `text`, avec `latest` par défaut, et non le genre `version` à liste fermée. Aucune liste ne tiendrait : le serveur distant de Zed doit correspondre exactement à la version du client installé sur le laptop, et un backend JetBrains à celle du Gateway. Une liste d'options serait fausse le jour de la première mise à jour de l'éditeur, côté client, sans que nous en sachions rien.
