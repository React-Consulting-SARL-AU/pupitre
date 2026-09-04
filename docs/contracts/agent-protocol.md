# Protocole app ↔ agent

Le canal est une session SSH ouverte par l'app avec la clé du client, qui lance `pupitred serve`. L'app écrit une requête JSON par ligne sur l'entrée standard ; l'agent répond par une ligne JSON, ou par un flux d'événements puis une réponse. Les types vivent dans `packages/shared/src/agent-protocol/` et sont exportés en JSON Schema pour Go.

## Enveloppe

```jsonc
// requête
{ "id": 12, "cmd": "project.up", "params": { "name": "flymate-api" } }

// événement, zéro ou plusieurs, pour une commande longue
{ "id": 12, "event": "log", "line": "vite v7 ready in 412 ms" }

// réponse, exactement une
{ "id": 12, "ok": true, "result": { "state": "online", "port": 5173 } }
{ "id": 12, "ok": false, "error": { "code": "project_not_found", "message": "…", "fix": "…" } }
```

- `id` est choisi par l'app, croissant, jamais réutilisé dans une session.
- Les requêtes sont sérialisées côté app : une seule commande en vol par canal. Les commandes longues (`install`, `upgrade`, `project.sync`) ouvrent un second canal pour ne pas bloquer les lectures d'état.
- Toute erreur porte un `code` stable, un `message` pour l'humain, et un `fix` quand un remède existe.
- La première commande d'une session est `hello` ; l'agent refuse le reste tant qu'elle n'a pas eu lieu.

## Commandes

### Session

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `hello` | `{ app_version, protocol }` | `{ agent_version, protocol, server_id?, entitlement: "valid" \| "grace" \| "restricted" \| "dev", capabilities[] }`. Un `protocol` incompatible renvoie `protocol_mismatch` avec la version attendue |
| `ping` | — | `{ ts }` |

### Inspection et installation

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `probe` | — | le rapport de sonde : `os`, `version`, `arch`, `ram_mb`, `disk_free_gb`, `sudo`, `ports[]`, `docker`, `panel`, `agent_version`, `installed_modules[]`, `verdict` |

`arch` est une chaîne libre, l'architecture brute rapportée par la machine (`uname -m` normalisé) : `amd64` et `arm64` sont les valeurs connues et prises en charge, mais le champ doit aussi pouvoir porter une architecture non supportée comme `i686`, celle-là même que le verdict `incompatible` sert à signaler.

`disk_free_gb` est un nombre unique : le plus petit entre l'espace libre à la racine et celui du dossier des projets. Le dossier des projets vit souvent sur son propre volume, et c'est celui des deux qui manquera en premier ; rapporter deux nombres n'aiderait pas à décider si la machine convient.

`verdict` décrit ce qu'installer sur cette machine impliquerait :

| Champ | Type | Description |
| --- | --- | --- |
| `level` | `"ready" \| "warning" \| "blocked"` | la gravité |
| `kind` | `"bare" \| "managed" \| "occupied" \| "incompatible"` | le genre de machine |
| `up_to_date` | `boolean`, optionnel | présent seulement quand `kind` vaut `managed` : l'agent installé est-il à la version courante |
| `reasons[]` | `string[]` | ce qui a été observé |
| `fixes[]` | `string[]` | comment y remédier, un fix par raison quand `kind` vaut `incompatible` ou `occupied` ; vide sur une machine `bare` ou un agent `managed` à jour |
| `catalog` | — | `{ modules: Manifest[], presets: Preset[] }` d'après [service-catalog.md](./service-catalog.md) ; un `Preset` porte son `id`, son `name` affichable et ses `modules`, si bien que l'app n'a rien à traduire |
| `install` | `{ modules[], config: Record<moduleId, values>, secrets_stdin: true }` | événements `step` `{ module, step, status: "start" \| "ok" \| "skip" \| "fail", ms, replay? }` puis `{ failed[], warned[], report_path }`. Les secrets sont lus sur un flux séparé, jamais dans `params` |
| `uninstall` | `{ modules[] }` | événements `step`, puis `{ failed[] }` |
| `harden` | `{ user: "dev" }` | événements `step`, puis `{ root_closed: boolean, next_user, reason? }`. Ne ferme root que si une clé ouvre `dev` |
| `upgrade` | `{ modules?: string[] }` | idem `install`, sur les modules déjà présents |
| `report` | — | le dernier rapport d'installation ; `no_report` tant qu'aucune installation n'a eu lieu sur ce serveur |

### État

| Commande | Résultat |
| --- | --- |
| `snapshot` | `{ machine, services[], projects[], sessions[], entitlement }` en un appel. C'est ce que le tableau de bord lit toutes les 3 secondes |
| `status` | `{ services[], projects[] }` allégé |
| `service.status` `{ id }` | état, version, port, identifiants (masqués), unité systemd |
| `completions` `{ path? }` | de quoi compléter une ligne de terminal : `{ command, sub[], projects[], root, path, paths[] }` |

`completions` répond en une fois aux trois questions d'une autocomplétion, pour que l'app n'ait rien à deviner :

| Champ | Type | Description |
| --- | --- | --- |
| `command` | `string` | le nom sous lequel les commandes de pilotage s'appellent sur ce serveur : `dev`, c'est-à-dire `pupitred dev` |
| `sub[]` | `{ name, help, args }` | la grammaire : un verbe, son aide, et une liste de valeurs par position d'argument. `$project` est un joker que l'app remplace par `projects[]` |
| `projects[]` | `string[]` | les projets réels du registre, dans son ordre |
| `root` | `string` | la racine des projets, le seul dossier que `completions` lit |
| `path` | `string` | le dossier effectivement listé, relatif à `root` ; vide pour la racine |
| `paths[]` | `string[]` | les entrées de ce dossier, relatives à lui, les dossiers avec une barre oblique finale |

`path` est relatif à `root` : un chemin absolu ou un `..` qui sort de la racine renvoie `bad_request`. Un dossier absent renvoie `paths: []` et non une erreur — une complétion ne fait pas échouer une frappe.

Un `Project` porte deux chemins. `dir` est le dossier déclaré dans le registre, relatif à la racine des projets du serveur, et c'est lui que `project.add` prend en paramètre. `path` est ce même dossier en absolu, résolu par l'agent : `/home/dev/projects/flymate/api`. C'est `path` qu'on ouvre dans l'éditeur distant et où l'on démarre un terminal.

Le chemin absolu vit sur le projet, pas sur la machine : `status`, `project.list` et `project.add` rendent des projets sans rendre de `machine`, et l'app n'aurait pas de racine à recoller. Elle ne concatène donc jamais rien — la racine des projets n'est pas dans le contrat, c'est un détail du serveur.

`path` est toujours présent et toujours dans la racine des projets, versionné ou non : l'agent le résout puis vérifie la contenance, et une ligne de registre qui viserait ailleurs n'est pas un projet — elle ne sort pas de `project.list`. Quand le projet est un dépôt git, `path` est cohérent avec le `root` que rend `project.git_status` : ce dernier est la racine que git déclare, qui vaut `path` ou l'un de ses parents à l'intérieur de la racine des projets, jamais au-dessus.

### Projets

| Commande | Paramètres |
| --- | --- |
| `project.list` | — |
| `project.add` | `{ name, dir, repo?, pkgmgr, host, port, subdomain?, cmd, install? }` |
| `project.remove` | `{ name }` (le dossier reste) |
| `project.up` / `project.down` / `project.restart` | `{ name \| "all" }` |
| `project.logs` | `{ name, lines?, follow? }` → événements `log` si `follow` |
| `project.sync` | `{ name }` : pull puis réinstallation des dépendances |
| `project.install` | `{ name }` |
| `project.env` | `{ name, force? }` : régénère `.env.local` |
| `project.branches` | `{ name }` |
| `project.checkout` | `{ name, branch }` |
| `project.git_status` | `{ name }` : `behind`, `ahead`, `dirty`, `changed`, `last`, `subject`, `problem` |
| `project.working_tree` | `{ name }` : fichiers changés |
| `project.diff` | `{ name, path }` : le patch brut |
| `project.url` | `{ name }` |
| `project.debug` | `{ name }` : redémarrage avec l'agent de débogage JVM |

### Agents, sessions, processus

| Commande | Paramètres |
| --- | --- |
| `agent.open` | `{ kind: "claude" \| "codex" \| "hermes", project }` : renvoie la commande tmux que l'app attache dans un terminal |
| `sessions.list` | — : pid, durée, RAM, kind, commande |
| `sessions.clean` | — |
| `processes.list` | — |
| `process.kill` | `{ pid, force? }` |
| `shots.list` / `shots.url` / `shots.clean` | — |

### Secrets, bases, tunnel

| Commande | Paramètres |
| --- | --- |
| `secrets.status` | — : les clés présentes dans `/etc/pupitre/env`, jamais leurs valeurs |
| `secrets.set` | `{ key }` : valeur lue sur le flux secret |
| `secrets.sync` | `{ project }` |
| `db.dump` / `db.import` / `db.shell` / `db.url` | `{ engine, name? }` |
| `tunnel.status` / `tunnel.sync` / `tunnel.restart` | — |

### Système

| Commande | Paramètres |
| --- | --- |
| `keys.list` | — : les clés du bloc balisé |
| `keys.sync` | — : force une lecture de `/api/v1/agent/state` |
| `agent.upgrade` | `{ version?, signature }` : télécharge, vérifie, remplace, redémarre |
| `reboot` | — |
| `doctor` | — : diagnostic court |
| `diag` | — : rapport complet à coller dans un ticket |

## Le flux secret

Une commande qui porte un secret (`install`, `secrets.set`) annonce `secrets_stdin: true`. L'app écrit alors **la ligne suivante de l'entrée standard** avec les secrets en JSON, immédiatement après la requête ; l'agent la consomme avant d'appeler le handler, sans la journaliser ni la renvoyer. Aucun secret n'apparaît dans `params`, dans un événement ou dans un rapport.

C'est bien l'entrée standard et non un descripteur séparé : `ssh` ne transmet que les descripteurs 0, 1 et 2, si bien qu'un `fd 3` ouvert par l'app n'atteindrait jamais l'agent. Comme les requêtes sont sérialisées, la ligne qui suit une requête à `secrets_stdin: true` est sans ambiguïté sa ligne de secrets.

Pour `install`, la ligne a la forme de `params.config`, groupée par identifiant de module, une valeur par champ `secret` du manifeste (schéma `InstallSecrets`) :

```jsonc
{ "db.postgres": { "app_password": "…", "remote_password": "…" }, "tool.github": { "token": "…" } }
```

Un module absent de la ligne n'a aucun secret. Une ligne absente, illisible ou qui ne respecte pas cette forme renvoie `bad_request` avec le `fix` qui montre la forme attendue, avant toute installation ; la requête suivante reste lue comme une requête.

Un champ `list` d'`items: "secret"` — `ai.hermes.providers`, par exemple — se transmet avec des clés indicées, une par valeur, dans l'ordre de la liste :

```jsonc
{ "ai.hermes": { "providers.0": "sk-…", "providers.1": "sk-…" } }
```

## Versionnage

`protocol` est un entier. L'agent accepte la version courante et la précédente. L'app refuse un agent trop vieux et propose `agent.upgrade`. Un champ ajouté à un résultat n'incrémente pas la version ; un champ retiré ou renommé, oui.

## Mode restreint

Sans droit d'usage valide depuis sept jours, `hello` renvoie `entitlement: "restricted"` et seules `hello`, `ping`, `snapshot`, `status`, `diag` et `agent.upgrade` répondent ; les autres renvoient `entitlement_required` avec le lien vers la console.

## Le tunnel local d'un port n'est pas du protocole

`tunnel.*` désigne le tunnel Cloudflare que l'agent gère sur le serveur. Amener un port du serveur sur le laptop est autre chose, et cela reste l'affaire de l'app : elle ouvre un `ssh -L` sur son propre canal, avec sa configuration SSH et sa clé. L'agent n'y participe pas, et c'est voulu — un tunnel local ne demande rien au serveur qu'une session SSH ne fasse déjà, et lui donner une commande de protocole reviendrait à faire décider au serveur d'une écoute sur la machine du client.
