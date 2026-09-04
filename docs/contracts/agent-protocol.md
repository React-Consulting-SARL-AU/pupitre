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
| `shots.read` | `{ path }` : le contenu d'une capture ; voir [Le contenu d'une capture](#le-contenu-dune-capture) |

### Secrets, bases, tunnel

| Commande | Paramètres |
| --- | --- |
| `secrets.status` | — : les clés présentes dans `/etc/pupitre/env`, jamais leurs valeurs |
| `secrets.set` | `{ key }` : valeur lue sur le flux secret |
| `service.secret` | `{ id, key }` : révèle la valeur d'un identifiant du module `id` ; voir [La valeur d'un identifiant](#la-valeur-dun-identifiant) |
| `secrets.sync` | `{ project }` |
| `db.dump` / `db.import` / `db.shell` / `db.url` | `{ engine, name? }` |
| `tunnel.status` / `tunnel.sync` / `tunnel.restart` | — |

### Système

| Commande | Paramètres |
| --- | --- |
| `keys.list` | — : les clés du bloc balisé |
| `keys.sync` | — : force une lecture de `/api/v1/agent/state` |
| `agent.upgrade` | `{ version?, signature?, allow_downgrade? }` : télécharge, vérifie, remplace, redémarre |
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

Pour `secrets.set`, la ligne est un objet plat d'une seule entrée, dont la clé est exactement le `key` de la requête (schéma `SecretsSetSecrets`) :

```jsonc
{ "OPENAI_API_KEY": "sk-…" }
```

Une valeur vide vaut une valeur absente : l'agent refuse en `bad_request` plutôt que d'écrire un secret vide.

Un champ `list` d'`items: "secret"` — `ai.hermes.providers`, par exemple — se transmet avec des clés indicées, une par valeur, dans l'ordre de la liste :

```jsonc
{ "ai.hermes": { "providers.0": "sk-…", "providers.1": "sk-…" } }
```

## La valeur d'un identifiant

`service.status` rend les identifiants d'un service masqués : une table `credentials` qui va d'un libellé au **nom** d'une clé de `/etc/pupitre/env`, jamais à sa valeur. `service.secret { id, key }` révèle la valeur d'une de ces clés, et rien d'autre.

L'agent refuse toute clé qui n'appartient pas au module `id` : la seule liste autorisée est celle des valeurs de la table `credentials` que `service.status` rend pour ce module. Un module ne lit donc jamais le secret d'un autre. Une clé inconnue du module, une clé absente de `/etc/pupitre/env` ou une valeur vide renvoie `bad_request`. Un module inconnu ou non installé renvoie `service_not_found`.

La valeur **ne sort pas dans le résultat**. Elle voyage sur un événement dédié, symétrique du flux secret d'entrée :

```jsonc
// requête
{ "id": 14, "cmd": "service.secret", "params": { "id": "db.mysql", "key": "MYSQL_APP_PASSWORD" } }

// événement secret, exactement un, avant la réponse
{ "id": 14, "event": "secret", "key": "MYSQL_APP_PASSWORD", "value": "…" }

// réponse : un accusé sans valeur
{ "id": 14, "ok": true, "result": { "key": "MYSQL_APP_PASSWORD" } }
```

Le principe est celui du flux secret d'entrée, dans l'autre sens : à l'entrée, une valeur ne se met pas dans `params`, qui se journalise et se rejoue ; à la sortie, elle ne se met pas dans `result`, l'unité qu'un enregistreur de requêtes et de réponses capture. L'événement `secret` est la seule ligne qu'un tel enregistreur sait écarter, et c'est par lui que l'app remet la valeur à l'écran sans la faire transiter par son pont IPC générique. L'agent ne l'écrit jamais dans son journal, ne la persiste jamais, ne la renvoie jamais dans `params`, un rapport ou un autre événement.

## Le contenu d'une capture

`shots.list` nomme les captures, `shots.url` donne l'adresse de la galerie servie sur le serveur. Ni l'une ni l'autre ne met une image sous les yeux de l'app : `shots.read { path }` le fait, et il rend le contenu, pas une adresse.

**Pourquoi pas une adresse par capture.** La galerie est un serveur en lecture seule sur `127.0.0.1:8099`, joignable depuis le serveur et de nulle part ailleurs. Une adresse par capture sur cette boucle locale ne serait utilisable par l'app qu'en ouvrant un `ssh -L` — et amener un port du serveur sur le laptop est justement ce que le protocole [laisse à l'app](#le-tunnel-local-dun-port-nest-pas-du-protocole). Une adresse joignable pour de bon voudrait dire la publier, par le tunnel ou par un port : ce serait une écoute de plus, atteignable par qui n'a pas la clé du client, alors que la règle est qu'aucune connexion entrante n'atteint le serveur et que le seul port ouvert est SSH. Une capture montre un écran d'application, souvent une session ouverte : elle mérite exactement la porte des autres commandes, et pas une de plus.

**Ce qui traverse le canal.** Les octets sortent en base64 sur des événements `shot`, comme la valeur d'un identifiant sort sur un événement `secret` : ce qui pèse ou ce qui compromet ne se met pas dans `result`, l'unité qu'un enregistreur de requêtes et de réponses capture entière.

```jsonc
// requête
{ "id": 21, "cmd": "shots.read", "params": { "path": "2026-09-04/login.png" } }

// événements shot, un par morceau, dans l'ordre
{ "id": 21, "event": "shot", "seq": 0, "bytes": "iVBORw0KGgoAAAANSUhEUg…" }
{ "id": 21, "event": "shot", "seq": 1, "bytes": "…" }

// réponse : de quoi vérifier ce qui vient de passer
{ "id": 21, "ok": true, "result": { "path": "2026-09-04/login.png", "media_type": "image/png", "size_bytes": 98304, "sha256": "…", "chunks": 2 } }
```

`path` est celui que `shots.list` rend, repris tel quel. `sha256` est l'empreinte des octets du fichier, en hexadécimal minuscule : l'app recolle les morceaux, compare, et sait sans ambiguïté si l'image est entière. `chunks` dit combien d'événements ont été émis, si bien qu'un flux tronqué se voit à l'accusé.

**Ce qui garde le canal utilisable.** Une capture est découpée en morceaux de 48 Kio, soit une ligne d'environ 64 Kio : le canal reste une suite de lignes bornées, jamais une ligne unique de plusieurs mégaoctets qu'un lecteur à tampon fixe ne saurait pas relire. La coupe tombe sur un multiple de trois, donc base64 ne complète que le dernier morceau : chaque `bytes` se décode seul, et leur concaténation se décode aussi. Au-delà de 16 Mio le fichier est refusé en `bad_request` avant toute lecture, sur la taille que `shots.list` rapporte : une capture ne monopolise pas le canal. Comme toute commande longue, une lecture bloque le canal sur lequel elle passe ; l'app qui lit une galerie pendant qu'elle rafraîchit un tableau de bord ouvre un second canal, exactement comme pour `install`.

**Ce que la commande ouvre, et rien d'autre.** Elle ne lit que ce que `shots.list` nomme : le `path` est cherché dans le listing de la galerie, pas résolu sur le disque. Un chemin absolu, un `..`, un fichier hors de la galerie ou une entrée qui n'est pas un fichier ordinaire n'y figurent pas et renvoient `bad_request`. Les seuls types rendus sont `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/avif` et `image/svg+xml` ; tout le reste est refusé. Aucun port n'est ouvert, aucune écoute n'est ajoutée : la commande passe par la session SSH que l'app tient déjà, donc elle ne donne accès à rien de plus qu'un client qui a déjà la clé du serveur.

`shots.url` reste ce qu'il était : l'adresse de la galerie pour un humain qui l'ouvre dans son navigateur, sur le serveur ou par le tunnel s'il l'a exposée. Ce n'est plus ce dont l'app se sert pour montrer une capture.

## Ce que la signature d'une mise à jour couvre

La signature est **Ed25519, encodée en base64**. Elle porte sur ce message exact, terminé par un saut de ligne :

```
pupitred\n<version>\n<architecture>\n<empreinte SHA-256 en hexadécimal minuscule>\n
```

L'empreinte est celle du binaire téléchargé, calculée par l'agent lui-même sur les octets qu'il vient de recevoir. Lier ainsi l'empreinte à la version et à l'architecture refuse aussi un binaire authentiquement signé par nous mais publié pour une autre version ou une autre machine.

La clé publique correspondante est **embarquée dans le binaire à l'édition de liens**. Un agent construit sans clé refuse toute mise à jour : c'est le défaut sûr, et c'est voulu. Rien n'est écrit sur le disque avant que la vérification ne réussisse.

**L'empreinte et la signature viennent de la plateforme, pas de l'app.** L'agent lit `GET /api/v1/agent/release/:version/metadata` avec son jeton de serveur ; il en tire l'empreinte attendue et la signature, refuse un binaire dont l'empreinte diffère de celle annoncée, puis vérifie la signature. `signature` reste dans les paramètres comme secours, pour un agent dont la plateforme est injoignable ou trop ancienne pour servir cette route : quand la plateforme répond, c'est elle qui fait foi et le paramètre est ignoré. Une mise à jour sans paramètre `signature` est donc le cas normal.

Ce format est la référence commune de la chaîne de publication (AGT-15), de l'agent (AGT-13) et de l'app (APP-12). Le changer casse les trois à la fois.

## Le plancher de version

Une signature ne périme jamais : le binaire vulnérable d'hier reste signé demain. Sans garde-fou, qui tient le canal peut donc réinstaller une version ancienne et connue faillible. L'agent refuse de descendre.

**Le plancher est la plus haute de deux versions** : celle que l'agent exécute au moment de la demande, et `minimum_version` que `/api/v1/agent/state` annonce pour ce serveur. Une version strictement inférieure au plancher est refusée avec `downgrade_refused`, avant tout téléchargement.

La version courante est le plancher qui compte, parce que l'agent la connaît sans rien demander : elle tient quand la plateforme est injoignable, c'est-à-dire précisément quand un canal hostile a le plus de latitude. `minimum_version` est la mémoire de la plateforme — la dernière version qu'elle a vue tourner sur ce serveur — et sert le cas où le binaire a été remplacé sans l'accord de l'agent : celui qui redémarre en 0.9.0 se voit rappeler qu'on l'a connu en 1.4.0. Quand la plateforme ne répond pas, le plancher se réduit à la version courante, et la mise à jour vers l'avant reste possible : un agent périmé doit rester réparable.

`allow_downgrade: true` lève le plancher, et rien d'autre : la signature, l'empreinte, la version et l'architecture sont vérifiées comme toujours. C'est un geste explicite du propriétaire, que l'app ne compose pas seule ; le refus qui le précède porte le `fix` qui le nomme.

## Versionnage

`protocol` est un entier. L'agent accepte la version courante et la précédente. L'app refuse un agent trop vieux et propose `agent.upgrade`. Un champ ajouté à un résultat n'incrémente pas la version ; un champ retiré ou renommé, oui.

## Mode restreint

Il y a deux situations, et elles n'ouvrent pas les mêmes commandes.

**Un serveur enrôlé qui a perdu la plateforme.** Sans droit d'usage valide depuis sept jours, `hello` renvoie `entitlement: "restricted"` et six commandes répondent : `hello`, `ping`, `snapshot`, `status`, `diag` et `agent.upgrade`. Le client garde ainsi la vue de sa machine et le moyen de réparer un agent périmé. Les autres renvoient `entitlement_required` avec le lien vers la console. Rien de ce qui tourne ne s'arrête : tmux, les projets et les services continuent.

**Un binaire sans jeton de serveur**, copié sur une autre machine, n'ouvre que `hello`, `ping` et `diag`. Il n'a aucun serveur à décrire et rien à mettre à jour : pas de jeton, donc pas de fonctions.

## Le tunnel local d'un port n'est pas du protocole

`tunnel.*` désigne le tunnel Cloudflare que l'agent gère sur le serveur. Amener un port du serveur sur le laptop est autre chose, et cela reste l'affaire de l'app : elle ouvre un `ssh -L` sur son propre canal, avec sa configuration SSH et sa clé. L'agent n'y participe pas, et c'est voulu — un tunnel local ne demande rien au serveur qu'une session SSH ne fasse déjà, et lui donner une commande de protocole reviendrait à faire décider au serveur d'une écoute sur la machine du client.
