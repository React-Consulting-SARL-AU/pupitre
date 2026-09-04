# Catalogue de services

Le catalogue est une **bibliothèque des stacks les plus utilisées**, choisies parce qu'elles s'installent et se gèrent proprement. Il ne cherche pas l'exhaustivité : ce qui n'y est pas, le client l'installe lui-même sur sa machine, et Pupitre ne s'y oppose pas. La sonde signale ce qu'elle trouve, les modules ne touchent qu'à ce qu'ils ont installé.

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
  mandatory: boolean             // true pour core.system et core.hardening
  since: string                  // version de l'agent
}

type Field =
  | { key: string; kind: "text" | "number" | "select"; label: string; help?: string; required: boolean; default?: unknown; options?: string[] }
  | { key: string; kind: "secret"; label: string; help?: string; required: boolean; generate?: boolean }  // generate: proposé généré, jamais affiché
  | { key: string; kind: "version"; label: string; options: string[]; default: string }
  | { key: string; kind: "boolean"; label: string; help?: string; required: false; default: boolean }  // une case à cocher, jamais requise
  | { key: string; kind: "list"; label: string; help?: string; required: boolean; items: "text" | "secret"; min?: number; max?: number }  // une liste de valeurs du même genre
```

Un `preset` porte un `id`, un `name` affichable et sa liste de modules : l'app montre le nom que l'agent donne, sans table de traduction.

## Étapes

Chaque module implémente `Check`, `Install`, `Configure`, `Upgrade`, `Uninstall`, `Status`. Chaque étape est idempotente : elle vérifie avant d'agir, et l'installation entière peut être rejouée sans dégât. Une étape émet des événements `step` avec sa durée ; une étape qui échoue n'arrête pas les autres modules, elle est notée avec sa commande de rejeu.

## Modules

### Socle — obligatoires

| Id | Fait | Champs |
| --- | --- | --- |
| `core.system` | paquets de base, fuseau, mises à jour de sécurité automatiques sans redémarrage, swap dimensionné, garde-fou mémoire (`systemd-oomd` ou `earlyoom`), utilisateur `dev` avec sudo, dont `authorized_keys` reçoit les clés non restreintes de root pour qu'une clé l'ouvre avant le durcissement, tmux, zsh et bash avec les marqueurs de prompt (OSC 133) lus par l'app, commande `dev` liée au binaire, identité git | `timezone`, `git_name`, `git_email`, `projects_dir` |
| `core.hardening` | ufw sur SSH seul (22, et 443 en option), fail2ban, root fermé et mots de passe désactivés **après** vérification qu'une clé ouvre `dev`, `AllowUsers dev`, `ClientAlive` | `ssh_443` (boolean) |

### Runtimes

| Id | Fait | Champs | MVP |
| --- | --- | --- | --- |
| `runtime.node` | mise ; Node, Bun, pnpm aux versions choisies ; activés dans tous les shells y compris non interactifs par un bloc balisé du `.zshenv` | `node_version`, `bun` (boolean), `pnpm` (boolean) | oui |
| `runtime.java` | Temurin via mise, daemon Gradle dimensionné pour la RAM | `java_version` | oui |
| `runtime.python` | uv et une version Python ; base des agents en Python | `python_version` | oui |
| `runtime.go`, `runtime.php`, `runtime.ruby` | via mise | version | après |
| `runtime.docker` | Docker Engine et Compose, `dev` dans le groupe | — | après |

### Bases de données

| Id | Fait | Champs | MVP |
| --- | --- | --- | --- |
| `db.mysql` | MySQL 8 ou MariaDB, lié à `127.0.0.1`, root sur socket, compte applicatif, compte distant pour le laptop à travers SSH, buffer pool dimensionné, import automatique des dumps déposés dans `~/dumps/` | `engine: mysql \| mariadb`, `app_password` (généré), `remote_password` (généré), `buffer_pool` | oui |
| `db.postgres` | PostgreSQL 17, local seulement, rôles applicatif et distant, extensions courantes, import de dumps | `app_password`, `remote_password` | oui |
| `db.mongodb` | MongoDB 8, local seulement, utilisateur applicatif, import de `mongodump` | `app_password` | oui |
| `db.redis` | local seulement, mot de passe, persistance | `password` | après |

### Agents IA

| Id | Fait | Champs | MVP |
| --- | --- | --- | --- |
| `ai.claude` | Claude Code, connexion par l'URL affichée dans le terminal de l'app, contexte du projet, skills Pupitre (capture, branche, PR, ship) | — | oui |
| `ai.codex` | Codex, idem | — | oui |
| `ai.hermes` | Hermes Agent (Nous Research) via Python, configuration des fournisseurs de modèles, service systemd si toujours actif | `providers` (list de secrets), `always_on` (boolean) | oui |
| `ai.browser` | Chrome headless, dépendances Playwright, commande de capture qui range les images dans la galerie | — | oui |

### Éditeurs distants

| Id | Fait | Champs | MVP |
| --- | --- | --- | --- |
| `editor.jetbrains` | backend de développement distant préinstallé dans le cache attendu par JetBrains Gateway, JVM et mémoire dimensionnées ; l'app ouvre par le lien Gateway ; licence du client | `ide: idea \| webstorm \| pycharm \| phpstorm \| goland`, `version` | oui |
| `editor.vscode` | CLI `code` et serveur distant préinstallés pour que la première connexion Remote SSH soit immédiate, extensions de base, Remote Tunnel en option ; même mécanisme pour Cursor et Windsurf | `extensions` (list de text), `tunnel` (boolean) | oui |
| `editor.zed` | serveur distant Zed préinstallé pour la version du client ; ouverture par `zed://ssh` | `version` | oui |

Visual Studio n'a pas de backend Linux : l'app le dit et renvoie vers `editor.vscode`.

### Exposition

| Id | Fait | Champs | MVP |
| --- | --- | --- | --- |
| `exposure.cloudflare` | un tunnel, une route par projet, DNS et certificat gérés, sous-domaines depuis le registre | `api_token` (secret), `account_id`, `zone_id`, `zone_name`, `domain` | oui |
| `exposure.ssh` | sans exposition publique : chaque projet sur son port, à travers la session SSH que l'app tient | — | oui |
| `exposure.caddy` | reverse proxy avec certificats automatiques pour un domaine sans Cloudflare | `domain` | après |

### Outils

| Id | Fait | Champs | MVP |
| --- | --- | --- | --- |
| `tool.github` | `gh`, clone HTTPS sans clé, clé du serveur enregistrée sur le compte | `token` (secret) | oui |
| `tool.1password` | CLI et compte de service, génération des `.env.local` depuis les gabarits des dépôts | `service_account_token` (secret) | oui |
| `tool.neon` | provisionnement d'une branche par projet qui le déclare | `api_key` (secret) | après |

## Préréglages

| Preset | Nom | Modules |
| --- | --- | --- |
| `web-js` | Web JavaScript | `core.*`, `runtime.node`, `db.mysql`, `ai.claude`, `ai.browser`, `editor.vscode`, `exposure.ssh` |
| `full` | Tout le catalogue | tout ce qui est marqué MVP |
| `minimal` | Minimal | `core.*`, un agent au choix |

## Source des étapes

`server/bootstrap.sh` et `server/bin/dev` décrivent, en bash et zsh, ce que chaque module reproduit : ordre, options apt (`DPkg::Lock::Timeout`), fermeture de root en dernier, rapport de fin, commandes de pilotage. Les agents lisent ces fichiers comme une spécification, pas comme du code à appeler.

### Le champ `version` des éditeurs reste du texte libre

Les modules d'éditeurs distants exposent `version` en `text`, avec `latest` par défaut, et non le genre `version` à liste fermée. Aucune liste ne tiendrait : le serveur distant de Zed doit correspondre exactement à la version du client installé sur le laptop, et un backend JetBrains à celle du Gateway. Une liste d'options serait fausse le jour de la première mise à jour de l'éditeur, côté client, sans que nous en sachions rien.
