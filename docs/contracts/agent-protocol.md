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
- Les requêtes sont sérialisées côté app : une seule commande en vol par canal. Les commandes longues (`install`, `upgrade`, `project.pull`, `project.sync`) ouvrent un second canal pour ne pas bloquer les lectures d'état, et les lectures que l'app fait sur minuterie (`snapshot`, `processes.list`) un troisième, pour qu'un geste n'attende jamais derrière elles.
- Toute erreur porte un `code` stable, un `message` pour l'humain, un `fix` quand un remède existe, et un `remedy` quand ce remède tient dans une valeur.
- La première commande d'une session est `hello` ; l'agent refuse le reste tant qu'elle n'a pas eu lieu.
- **Une coupure emporte la session, pas la commande.** `pupitred serve` ignore la fermeture de ses descripteurs : `install`, `upgrade` et `harden` vont jusqu'au bout sans personne pour les lire, le rapport est écrit avant chaque étape, et un verrou sur `/var/lib/pupitre/install.lock` fait refuser `busy` à toute autre session — ou à `pupitred install` sur la machine — tant que cette exécution dure. L'app, elle, rouvre le canal aussi longtemps que la commande avait de temps, rejoue les étapes que le canal n'a pas portées d'après le rapport, et le relit jusqu'à `finished_at`. Un rapport daté d'avant la demande est celui d'une autre exécution : la coupure reste alors la seule vérité à dire, et `busy` en réponse à un `install` se suit comme une installation en cours.

### Le remède structuré

`fix` est une phrase, écrite pour un humain. Quand le remède tient dans une valeur, l'erreur porte en plus `remedy`, un objet discriminé par son propre `code` :

```jsonc
{ "id": 12, "ok": false, "error": {
  "code": "bad_request",
  "message": "le port 3000 est déjà pris par web",
  "fix": "Donne un autre port à api, par exemple 3001.",
  "remedy": { "code": "port_taken", "port_free": 3001 }
} }
```

Deux remèdes existent. `invalid_fields` accompagne `invalid_config` et porte les `FieldProblem` de la configuration refusée, un par champ, si bien que l'écran marque les champs au lieu d'imprimer une phrase. `port_taken` est rendu par `project.add` quand un projet déclaré tient déjà le port demandé. `port_free` est le premier port libre du registre à partir de celui-là. L'app applique cette valeur au lieu d'extraire un entier d'une phrase française — une formulation change, un champ non.

`remedy` est optionnel et ne remplace jamais `fix` : une erreur dont le remède ne se résume pas à une valeur n'en porte pas.

## Commandes

Tout ce qui suit est dans le contrat et répond sur `pupitred serve`. Neuf commandes ne sont appelées par aucun écran de l'app aujourd'hui : `status`, `doctor`, `diag`, `project.env`, `project.debug`, `sessions.list`, `secrets.sync`, `keys.list` et `keys.sync`. `status` et `doctor` s'obtiennent aussi sur la machine par `pupitred dev status` et `pupitred dev doctor` ; les autres n'ont que le protocole.

### Session

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `hello` | `{ app_version, protocol, locale? }` | `{ agent_version, protocol, server_id?, entitlement: "valid" \| "grace" \| "restricted" \| "dev", capabilities[], config? }`. Un `protocol` incompatible renvoie `protocol_mismatch` avec la version attendue. `locale` vaut `fr` ou `en` — les langues que le produit sert — et vaut pour toute la session : l'agent répond dans cette langue quand il la connaît, dans la sienne sinon. Jamais une erreur, jamais un champ vide. Un agent d'une version antérieure ignore le champ et répond comme avant ; la version de protocole ne bouge donc pas. `server_id` est réservé : aucun agent ne l'émet encore. `config` dit où en est la configuration de la machine face au binaire qui la lit — `{ revision, expected, state }` — et voir [migrations de configuration](./config-migrations.md) ; un agent antérieur au registre ne le rend pas, et l'app tient alors la configuration pour courante |
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
| `install` | `{ modules[], config: Record<moduleId, values>, defer?: moduleId[], secrets_stdin: true }` | événements `step` `{ module, step, status: "start" \| "ok" \| "skip" \| "fail", ms, replay?, message? }` — `replay` est la commande qui rejoue le module, `message` ce que l'agent a à dire de l'étape — la ligne brute (expurgée) d'un `fail`, ou l'avertissement que porte une étape `ok`/`skip` — puis `{ failed[], warned[], report_path }`, où `failed` et `warned` sont des identifiants de module, une fois chacun. Les secrets sont lus sur un flux séparé, jamais dans `params`. `config` remplace la configuration du module ; un secret absent du flux n'est pas effacé, l'agent garde celui qu'il détient, si bien que changer un port ne vide pas un mot de passe. **Toute la configuration est validée avant la première étape** : un refus est `invalid_config`, porte la liste complète dans son remède `invalid_fields`, et rien n'est touché sur la machine |
| `install.check` | `{ modules[], config, defer?: moduleId[] }` | `{ problems: FieldProblem[], warnings[] }` d'après [service-catalog.md](./service-catalog.md). Aucun secret ne l'accompagne et rien n'est touché : elle rejoue la validation des champs et y ajoute ce que seule la machine sait — un port déjà écouté, un dossier qui est un fichier, un fuseau que ce noyau ignore. Elle ne juge jamais un secret, que l'app est seule à détenir avant l'installation |
| `uninstall` | `{ modules[] }` | événements `step`, puis `{ failed[] }` |
| `harden` | `{ user: "dev" }` | événements `step`, puis `{ root_closed: boolean, root_kept: boolean, next_user, reason? }`. Ne ferme root que si une clé ouvre `dev`. `root_kept` dit que root reste ouvert parce que `keep_root` le demande, jamais parce que le durcissement a renoncé : les deux drapeaux ne sont jamais vrais ensemble, et un refus est `root_closed: false` avec sa `reason` |
| `upgrade` | `{ modules?: string[] }` | idem `install`, sur les modules déjà présents |
| `module.config` | `{ id }` | ce que l'agent a retenu de la dernière demande pour ce module : `{ id, values, secrets[] }`. `values` porte la configuration en clair, `secrets[]` le seul nom des champs secrets détenus — aucune valeur de secret ne sort par là. C'est ce que l'app remet dans le formulaire d'un module déjà installé |
| `report` | — | le rapport de l'installation en cours ou de la dernière ; `no_report` tant qu'aucune n'a eu lieu sur ce serveur. L'agent l'écrit avant chaque événement `step` : tant que l'installation court, `finished_at` est vide et une étape `start` sans fin est celle qui tourne. C'est ce qu'une app dont le canal a coupé relit, jusqu'à ce que `finished_at` soit posé |

`defer` nomme les modules à poser **sans les configurer** : leurs champs ne sont pas pesés — il n'y a pas de réponse à juger — leur étape `Configure` ne tourne pas, et l'agent les note dans `install.json`. Un service dont le client n'a pas encore les réglages, ou dont le compte n'est pas connecté, ne retient donc plus toute l'installation ; il attend sur l'écran des services, où le formulaire le termine. Un module `mandatory` ne se remet pas à plus tard : la demande est refusée en `bad_request` avant la première étape.

Un module reste remis à plus tard **jusqu'à la demande qui le nomme sans le différer** — celle de l'app, ou un rejeu sur la machine — et cette demande est jugée comme les autres : sans réponse à ses champs requis, elle est refusée en `invalid_config` et rien ne bouge. `upgrade` laisse ces modules tranquilles, faute de réglages à rejouer, et `uninstall` les oublie.

`snapshot`, `status` et `service.status` rendent chaque service avec `configured` : **faux pour un module remis à plus tard et jamais repris depuis**, vrai pour tout autre module installé. Ce n'est pas un module qui en décide — il ne sait dire que ce qui est sur le disque, et une dérive après une mise à niveau se lirait comme des questions sans réponse — mais l'agent, d'après ce que les demandes ont laissé. Un agent antérieur au champ ne le rend pas, et l'app tient alors le service pour configuré.

Ils rendent aussi deux réponses du manifeste, pour que le tableau de bord de l'app n'ait pas à lire le catalogue : `runs` — le module tient un processus, ou en lance un à tout moment ; l'app ne montre que ceux-là, et un agent antérieur au champ ne le rend pas, l'app tient alors le service pour un service qui tourne — et `connection`, le compte tiers que l'app doit détenir pour ce module, absent quand le manifeste n'en déclare aucun. C'est sur lui que l'app dit d'un tunnel s'il est connecté : le compte qu'elle détient, jamais une question posée à l'agent.

### État

| Commande | Résultat |
| --- | --- |
| `snapshot` | `{ machine, services[], projects[], sessions[], entitlement }` en un appel. C'est ce que le tableau de bord lit toutes les 3 secondes |
| `status` | `{ services[], projects[] }` allégé |
| `service.status` `{ id }` | état, version, port, identifiants (masqués), unité systemd, et `login` pour un module dont le CLI se connecte à un compte |
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
| `project.add` | `{ name, dir, repo?, branch?, pkgmgr, host, port, routes[], cmd, install? }` : chaque route porte `{ label, port, subdomain? }` |
| `project.detect` | `{ repo, branch? }` ou `{ dir }` : ce qu'un dépôt demande, sans rien installer |
| `project.update` | `{ name, patch }` avec `patch: { cmd?, install?, branch?, routes? }` : réécrit la ligne du projet et répond le `Project` mis à jour |
| `project.remove` | `{ name }` (le dossier reste) |
| `project.up` / `project.down` / `project.restart` | `{ name \| "all" }` |
| `project.logs` | `{ name, lines?, follow? }` → événements `log` si `follow` |
| `project.pull` | `{ name }` → `{ pulled, state }` : clone si le dossier n'a pas de dépôt, `pull --rebase --autostash` sinon, et rien d'autre ; `pulled` est faux pour un dossier sans dépôt. C'est la phase « sources » de l'ajout d'un projet, l'installation venant ensuite par `project.install` |
| `project.sync` | `{ name }` → `{ pulled, installed, state }` : `project.pull` puis `project.install` en une commande, le geste de synchronisation de l'écran d'un projet |
| `project.install` | `{ name }` → `{ done, command? }` : `command` est la ligne d'installation du gestionnaire de paquets qui a tourné, `bun install` par exemple ; absente quand le projet n'en déclare aucune |
| `project.env` | `{ name, force? }` : régénère `.env.local` |
| `project.branches` | `{ name }` |
| `project.checkout` | `{ name, branch }` |
| `project.git_status` | `{ name }` : `behind`, `ahead`, `dirty`, `changed`, `last`, `subject`, `problem` |
| `project.working_tree` | `{ name }` : fichiers changés |
| `project.diff` | `{ name, path }` : le patch brut |
| `project.url` | `{ name }` |
| `project.debug` | `{ name }` : redémarrage avec l'agent de débogage JVM → `{ state, port?, debug_port }` |

#### Le port de débogage vient de la machine

`project.debug` arrête le projet puis le relance en ajoutant `-PdebugPort=<port>` à sa propre commande, et répond l'état, le port du projet et le port de débogage. Ce port n'écoute que sur la boucle locale : il revient par la session SSH comme la base de données, rien de neuf ne s'ouvre sur le pare-feu. `project.restart` remet le projet sur un démarrage normal ; il n'y a pas de second paramètre pour ça.

Quels projets sont débogables et sur quel port se lit dans `/etc/pupitre/env`, jamais dans le binaire :

```
PUPITRE_DEBUG_PORTS="api:5005 worker:5006"
```

Les guillemets sont ceux de systemd, qui lit ce fichier comme `EnvironmentFile` : sans eux, une valeur à espaces ne serait plus une seule variable. Un projet absent de la liste est refusé en `bad_request`, avec la ligne à écrire dans le `fix` ; une ligne `service`, qui appartient à systemd et non à une fenêtre tmux, l'est aussi.

#### Ce qu'un dépôt demande, avant de l'ajouter

`project.detect` répond à ce que l'écran d'ajout doit deviner avant `project.add` : quel gestionnaire de paquets, quelle commande de démarrage, quel port. Elle prend **une seule** source — `repo` pour un dépôt que le serveur ne connaît pas encore, `dir` pour un dossier déjà présent sous la racine des projets — et le contrat refuse les deux à la fois comme aucun des deux.

Elle n'installe rien et ne déclare rien. Un `repo` est cloné **en surface et en partie** — `--depth 1`, sans étiquettes, `--filter=blob:limit=65536` et `--no-checkout` : les arbres et les petits blobs arrivent en un seul paquet, et seuls les fichiers que la détection lit sont écrits (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `vite.config.*`, les fichiers de verrou, `pyproject.toml`, `gradlew`, jusqu'à deux dossiers de profondeur pour les membres d'un workspace). Un dépôt lourd d'images ou d'historique coûte ce que coûte un dépôt vide ; un serveur qui ne connaît pas le filtre le dit et envoie tout, ce qui se lit pareil. Le clone va dans le cache de l'utilisateur des projets, `~/.cache/pupitre/detect/<tirage>`, jamais sous la racine des projets : un clone à moitié fait ne doit pas pouvoir passer pour un projet. Le dossier est effacé dès la lecture finie, que la lecture ait réussi ou non. Chaque détection tire son propre nom, si bien que deux détections simultanées ne se marchent pas dessus ; et comme un agent tué en plein clone n'efface rien, chaque détection balaie d'abord ce que le cache garde depuis plus d'une heure — un âge qu'aucun clone en vol ne peut atteindre.

| Champ | Description |
| --- | --- |
| `pkgmgr` | ce que le dépôt prouve : le champ `packageManager` du `package.json`, sinon son fichier de verrou (`bun.lock`, `pnpm-lock.yaml`, `package-lock.json`), sinon `bun` pour un `package.json` sans verrou. Sans `package.json` : `uv` pour un `pyproject.toml`, `gradle` pour un `gradlew`, `none` sinon |
| `install` | la commande d'installation de ce gestionnaire, absente quand il n'en a pas |
| `cmd` | la commande de démarrage : le premier script `dev`, `start` ou `serve` du `package.json`, sur le port de `port_hint`. Absente quand le dépôt n'en déclare aucun |
| `port_hint` | le port que le dépôt demande — le `--port` de son script, le `server.port` de sa configuration Vite — s'il est libre sur ce serveur ; sinon le premier port libre du registre. Un script qui ne fait que lancer un autre script (`"dev": "bun run dev:app"`) se lit au bout de la chaîne, cinq sauts au plus |
| `host_hint` | le nom en `.localhost` que le script de démarrage fige dans son `--host` (`react-box.localhost`), quand il en fige un. C'est le `host` à déclarer : un tel nom ne se résout pas de lui-même sur un serveur, et un serveur de développement qui s'y lie sans réponse attend sans fin |

Rien de tout cela n'est une décision : la détection propose, le client corrige à l'écran, et `project.add` reste l'autorité — c'est lui qui refuse un port déjà pris, avec le remède qui porte le port libre.

**Le `host` d'un projet est `127.0.0.1`, ou un nom en `.localhost` que la machine fait répondre.** Un dépôt qui fige `--host react-box.localhost` dans son script suppose ce que le portable du client fait seul — résoudre `*.localhost` sur la boucle locale — et qu'un serveur ne fait pas. L'agent tient donc dans `/etc/hosts` un bloc balisé `projects`, réécrit à chaque `project.add` et `project.remove` : une ligne `127.0.0.1 <host>` par projet dont le `host` finit en `.localhost`, en IPv4 seulement, pour que le serveur de développement se lie là où le port est sondé et où le tunnel frappe. Tout `host` qui n'est ni `127.0.0.1` ni un nom en `.localhost` est refusé en `bad_request`.

#### Un projet, une commande, plusieurs ports

Un `Project` tient un port principal, `port` — c'est lui qui décide de l'état `online` et de l'adresse locale — et une liste `routes[]` : chaque port que l'écran a relevé, `{ label, port, hostname? }`. `label` est un mot court, une seule étiquette DNS : `web`, `api`, `docs`. `hostname` est le nom **complet** sous lequel ce port répond sur le web, tel que le registre le garde ; une route sans `hostname` est un port que personne ne publie. Le cas Turborepo est le cas général : `turbo run dev` lance `web`, `api` et `docs` dans une seule fenêtre, et le projet porte trois routes.

**Le nom d'hôte se résout une fois, à l'ajout, et se stocke.** `project.add` reçoit des routes `{ label, port, subdomain? }` ; pour chaque `subdomain`, l'agent compose `<subdomain>.<domaine>` à partir du domaine que le serveur publie — celui que le module d'exposition a écrit dans `PUPITRE_DOMAIN` — et garde le résultat. Un serveur sans domaine refuse une route qui porte un `subdomain`, avec le `fix` qui dit d'installer une exposition ou de laisser le port sans nom. Rien, ensuite, ne recompose une adresse depuis un sous-domaine : `url` se lit sur le `hostname` stocké de la route principale, celle dont le port est `port`. **Un domaine qui change emporte tous les noms** : quand le module d'exposition reçoit un autre `domain`, son étape `move-routes` réécrit chaque `hostname` du registre qui finissait par l'ancien domaine sous le nouveau, avant d'enregistrer le domaine et d'écrire l'ingress — un projet ne répond jamais sous un domaine que le serveur ne publie plus. Les enregistrements DNS, eux, sont l'affaire de l'app : elle relève les noms d'avant, retire ceux qu'elle avait écrits, et pose les nouveaux.

Le schéma de nommage est celui que l'app propose : `<sous-domaine>.<domaine>` pour la route principale, `<label>-<sous-domaine>.<domaine>` pour les autres. C'est une proposition de l'écran, pas une règle de l'agent — chaque route reçoit le sous-domaine que le client a laissé dans son champ.

Le registre refuse un port déjà tenu par un projet du serveur, principal ou de route, avec le port libre dans le remède ; un nom d'hôte déjà pris ; deux routes du même projet sous le même libellé ; et un `hostname` qui n'est pas sous le domaine du serveur — le tunnel et le DNS de cette machine ne portent rien d'autre.

`project.detect` sait lire un monorepo : un `turbo.json` à la racine et des `workspaces` dans le `package.json` — ou un `pnpm-workspace.yaml` — font proposer `cmd = turbo run dev` sous le gestionnaire détecté et une route par workspace dont le script `dev`, `start` ou `serve` nomme un port, libellée du nom du workspace, sur un port libre du serveur. Le résultat gagne `routes?: { label, port }[]` ; comme le reste, il propose, et `project.add` reste l'autorité.

#### La configuration se rouvre

`project.update { name, patch }` change ce qui peut l'être sans retirer le projet : `cmd`, `install`, `branch`, `routes`. Un champ absent du `patch` reste ce qu'il était. `routes` **remplace la liste entière** — l'écran envoie ce qu'il montre, et une route qui n'y est plus est une route qui part — et chaque route porte `{ label, port, subdomain? | hostname? }` : `subdomain` pour laisser l'agent composer le nom, `hostname` complet pour qui veut autre chose sous le domaine du serveur, jamais les deux. Un `install` vide rend la commande au gestionnaire de paquets.

La commande **redémarre le projet seulement si `cmd` a changé et qu'il tournait** : une route ou une branche ne touchent à rien de ce qui tourne. Elle répond le `Project` mis à jour, et refuse une ligne qui vient du `projects.conf` du dépôt, comme `project.remove`. Ce qu'un nom d'hôte retiré laisse derrière lui — l'enregistrement DNS — est l'affaire de l'app, qui l'a écrit : elle compare les noms d'avant et d'après, retire ceux qui partent, puis demande `tunnel.sync`.

#### La branche, et le nom sur le web

`project.add` et `project.detect` prennent une `branch`. Absente, c'est la branche par défaut du dépôt qui est clonée ; présente, elle voyage jusqu'à `git clone --branch`, et la ligne du registre la garde, si bien qu'un projet remis en place des mois plus tard revient sur la même branche. Elle n'a de sens qu'avec un dépôt : un dossier déjà sur la machine se lit tel qu'il est, et le contrat refuse `branch` à côté de `dir`.

Le `subdomain` d'une route accepte **plusieurs étiquettes séparées par des points**. Une seule reste ce que l'app propose, parce que c'est ce que couvre le certificat universel d'un tunnel Cloudflare ; `api.shop` demande à l'inverse un Advanced Certificate Manager sur la zone du client, et c'est sa décision, pas celle du produit. Chaque étiquette est une étiquette DNS — elle commence et finit par une lettre ou un chiffre, les tirets vivent au milieu — et le tout est borné à 190 caractères, ce qui laisse la place d'une zone derrière.

### Agents, sessions, processus

| Commande | Paramètres |
| --- | --- |
| `agent.open` | `{ kind: "claude" \| "codex" \| "cursor" \| "gemini" \| "copilot" \| "opencode" \| "hermes", project }` : renvoie la commande tmux que l'app attache dans un terminal |
| `sessions.list` | — : pid, durée, RAM, kind, commande |
| `sessions.clean` | — |
| `processes.list` | — |
| `process.kill` | `{ pid, force? }` |
| `shots.list` / `shots.url` | — |
| `shots.clean` | `{ path? }` → `{ removed }` : sans `path`, le ménage de la galerie ; avec, cette seule capture ; voir [Le contenu d'une capture](#le-contenu-dune-capture) |
| `shots.read` | `{ path }` : le contenu d'une capture ; voir [Le contenu d'une capture](#le-contenu-dune-capture) |

### Fichiers

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `fs.list` | `{ path }` | `{ path, entries[], truncated }` : le contenu d'un dossier ; voir [Fichiers](#fichiers-1) |
| `fs.stat` | `{ path, hash? }` | `{ path, kind, size_bytes, modified_at, mode, media_type?, sha256? }` |
| `fs.read` | `{ path }` | événements `file`, puis `{ path, media_type, size_bytes, sha256, chunks }` |
| `fs.write` | `{ path, content, sha256? }` | `{ path, size_bytes, sha256 }` |
| `fs.mkdir` | `{ path }` | `{ path }` |
| `fs.rename` | `{ path, to }` | `{ path }` : la nouvelle place de l'entrée |
| `fs.remove` | `{ path, recursive? }` | `{ path, removed }` |

### Services, secrets, bases, tunnel

| Commande | Paramètres |
| --- | --- |
| `service.start` / `service.stop` / `service.restart` | `{ id }` → le `ServiceStatusResult` mis à jour ; voir [Un service se pilote sur son unité](#un-service-se-pilote-sur-son-unité) |
| `service.logs` | `{ id, lines?, follow? }` → `{ lines[] }`, et événements `log { line }` si `follow`, la forme de `project.logs` |
| `service.secret` | `{ id, key }` : révèle la valeur d'un identifiant du module `id` ; voir [La valeur d'un identifiant](#la-valeur-dun-identifiant) |
| `secrets.sync` | `{ project }` |
| `db.dump` / `db.import` / `db.shell` / `db.url` | `{ engine, name? }` |
| `tunnel.status` / `tunnel.sync` / `tunnel.restart` | — |

### Système

| Commande | Paramètres |
| --- | --- |
| `enroll` | `{ platform_url, secrets_stdin: true }` : le jeton d'enrôlement est lu sur le flux secret ; l'agent l'échange contre son jeton de serveur, écrit `platform_url` dans `/etc/pupitre/platform.url` — le battement de cœur et le droit d'usage tournent sans l'app, et rien d'autre ne leur dirait où répondre — puis lit `/agent/state` une première fois. Résultat `{ enrolled: true, entitlement, synced_at? }`. Répond aussi en [mode restreint](#mode-restreint), et c'est la commande qui en sort |
| `keys.list` | — : les clés du bloc balisé, `{ keys[]: { fingerprint, comment?, device_id? }, synced_at? }`. `device_id` est réservé : aucun agent ne l'émet encore |
| `keys.sync` | — : force une lecture de `/api/v1/agent/state` |
| `platform.sync` | — : la même lecture, suivie du heartbeat. `{ synced_at, heartbeat_at? }`. L'app la demande à la fin d'une installation et d'un durcissement, pour que la console montre les modules au lieu d'un serveur vide pendant cinq minutes. Elle lit et rapporte, ne touche à rien de la machine, et reste donc ouverte en mode restreint : un serveur dont la plateforme n'a pas confirmé le droit d'usage est exactement celui qui doit redemander. Un `heartbeat_at` absent dit que l'état a été lu et que le battement n'est pas passé ; le daemon le refera |
| `agent.upgrade` | `{ version?, signature?, allow_downgrade? }` : télécharge, vérifie, remplace, redémarre |
| `agent.migrate` | — : porte la configuration de la machine à la forme que ce binaire lit, et rend `{ revision, expected, state, applied[], pending[], backup?, failure?, restored }`. Elle répond toujours, même quand une migration a refusé : ce sont les autres commandes qui refusent alors. Voir [migrations de configuration](./config-migrations.md) |
| `reboot` | — |
| `doctor` | — : diagnostic court |
| `diag` | — : rapport complet à coller dans un ticket |

## Le flux secret

Une commande qui porte un secret (`install`, `enroll`) annonce `secrets_stdin: true`. L'app écrit alors **la ligne suivante de l'entrée standard** avec les secrets en JSON, immédiatement après la requête ; l'agent la consomme avant d'appeler le handler, sans la journaliser ni la renvoyer. Aucun secret n'apparaît dans `params`, dans un événement ou dans un rapport.

C'est bien l'entrée standard et non un descripteur séparé : `ssh` ne transmet que les descripteurs 0, 1 et 2, si bien qu'un `fd 3` ouvert par l'app n'atteindrait jamais l'agent. Comme les requêtes sont sérialisées, la ligne qui suit une requête à `secrets_stdin: true` est sans ambiguïté sa ligne de secrets.

Pour `install`, la ligne a la forme de `params.config`, groupée par identifiant de module, une valeur par champ `secret` du manifeste (schéma `InstallSecrets`) :

```jsonc
{ "db.postgres": { "app_password": "…", "remote_password": "…" }, "tool.github": { "token": "…" } }
```

Un module absent de la ligne n'a aucun secret. Une ligne absente, illisible ou qui ne respecte pas cette forme renvoie `bad_request` avec le `fix` qui montre la forme attendue, avant toute installation ; la requête suivante reste lue comme une requête.

Pour `enroll`, la ligne porte le seul jeton d'enrôlement (schéma `EnrollSecrets`) :

```jsonc
{ "enrollment_token": "enr_…" }
```

Le jeton d'enrôlement est un secret comme un autre : il n'entre pas dans `params`, ne paraît dans aucun événement, ne s'écrit dans aucun journal, et ne devient jamais un argument de ligne de commande — un argument serait lisible dans `ps` par quiconque a un compte sur la machine. C'est aussi pourquoi `pupitred enroll` le lit sur son entrée standard : la commande de protocole et la sous-commande empruntent le même chemin. `platform_url` reste dans `params`, car ce n'est pas un secret et c'est ce qu'un journal doit pouvoir dire quand l'échange échoue.

L'agent n'a pas encore de jeton de serveur au moment où il enrôle : `enroll` fait donc partie des commandes qu'un binaire non enrôlé ouvre, et c'est la seule qui change cet état.

Un champ `list` d'`items: "secret"` — `ai.hermes.providers`, par exemple — se transmet avec des clés indicées, une par valeur, dans l'ordre de la liste :

```jsonc
{ "ai.hermes": { "providers.0": "sk-…", "providers.1": "sk-…" } }
```

## Un service se pilote sur son unité

`service.status` rend l'unité systemd que le module déclare dans `unit`, et c'est à elle que `service.start`, `service.stop` et `service.restart` s'adressent. Un service `failed` a ainsi un remède sur sa page, sans réinstaller quoi que ce soit : le module n'est pas rejoué, seule son unité bouge.

**La réponse est l'état, pas l'intention.** L'agent attend que systemd ait rendu son verdict — `systemctl start` tient la commande jusqu'à ce que l'unité soit partie ou ait échoué, trois minutes au plus — puis relit le service et répond ce que `service.status` aurait répondu — `running`, `stopped`, `failed` — sans la table `credentials`, qui reste à `service.status` seul. Un `start` dont l'unité retombe ne répond donc jamais `running`. Quand systemd refuse l'action elle-même, l'erreur est `internal`, porte ce que systemd a dit, et son `fix` renvoie vers `service.logs`.

**Ce qui est refusé, avant de toucher à systemd.** Un `id` qui n'est pas un module installé renvoie `service_not_found`, comme `service.status`. Un module installé sans unité — `core.*`, un outil qui ne tient aucun processus — renvoie `bad_request` : il n'y a rien à démarrer, rien à arrêter, rien à lire.

**Le verrou de run.** Les trois commandes le prennent, exactement comme `tunnel.restart` : pendant une installation, elles répondent `busy` plutôt que de bouger une unité que l'installation est en train d'écrire. `service.logs` ne le prend pas — une lecture répond toujours — et refuse les mêmes `id` que les trois autres.

**Le journal.** `service.logs { id, lines?, follow? }` lit `journalctl -u <unit> -n <lines> --no-pager -o cat`, cent vingt lignes par défaut comme `project.logs`, et répond `{ lines[] }`. Avec `follow`, chaque ligne voyage sur un événement `log { line }`, la queue comprise, `journalctl -f` tient la ligne, et la réponse `{ lines: [] }` ferme le flux au bout du même quart d'heure que le suivi d'un projet. Comme toute commande longue, un suivi bloque le canal sur lequel il passe : l'app l'ouvre sur son canal de travail, comme `project.logs`.

## Compte d'un CLI

`service.status` rend `login` pour un module dont le CLI se connecte à un compte — Claude Code, Codex, `gh`, `op`, `neonctl`, Wrangler, le tunnel de VS Code — et rien pour les autres :

```ts
type Login = {
  state: "signed_in" | "signed_out" | "unknown"
  account?: string   // ce que le CLI nomme : un login, un email, un compte
  fix?: string       // comment se connecter, dans la langue de la session
}
```

`signed_in` nomme le compte quand le CLI le fait. `signed_out` est un CLI qui ne tient rien, ou dont la propre vérification refuse ce qu'il tient. `unknown` est un CLI qu'on n'a pas pu interroger : la clé est là, le fournisseur n'a pas répondu — le `fix` dit quoi faire dans les deux cas, et l'app l'affiche tel quel.

C'est le CLI qui répond, par sa propre commande, et **`service.status` seul** le lui demande : la question peut coûter un aller-retour chez le fournisseur, et un `snapshot` lu toutes les trois secondes ne le paie jamais. Le tableau de bord de l'app, qui dit sous chaque service en marche s'il est connecté, la pose une fois par service quand il s'ouvre et garde la réponse jusqu'au retour sur la page. Un agent antérieur au champ ne le rend pas, et l'app ne dit alors rien du compte. La liste des commandes par module est dans [service-catalog.md](./service-catalog.md#compte-dun-cli).

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

**Une capture se supprime seule.** `shots.clean` sans paramètre fait le ménage de la galerie — ce qui a dépassé sa durée de garde s'en va — et répond `{ removed }`, le nombre de captures parties. `shots.clean { path }` supprime cette seule capture, et répond `{ removed: 1 }`. Le `path` passe par la même porte que `shots.read` : il est cherché dans le listing de `shots.list`, jamais résolu sur le disque. Un chemin absolu, un `..`, une entrée que la galerie ne nomme pas — ou ne nomme plus, parce qu'elle vient d'être supprimée — renvoient `bad_request` avec le remède qui dit de reprendre un `path` du listing.

## Fichiers

Les sept commandes `fs.*` ouvrent l'arbre de travail du client : lister un dossier, décrire une entrée, lire un fichier, en écrire un, créer un dossier, déplacer une entrée, en supprimer une.

**Une seule racine, et rien au-dessus.** Tout chemin est relatif au dossier de travail du serveur — le foyer du compte des projets — et cette racine ne figure pas dans le contrat, exactement comme la racine des projets n'y figure pas : c'est un détail du serveur, et l'app n'a donc rien à concaténer. La chaîne vide nomme la racine elle-même, et c'est le seul chemin que `fs.list` accepte vide. Un chemin absolu, un `..`, un lien symbolique dont la cible sort de la racine renvoient `bad_request` avec le remède qui dit comment nommer un chemin. L'agent ne juge pas ces chemins à la main : il ouvre la racine une fois et n'agit qu'à travers elle, si bien qu'un lien planté dans l'arbre ne peut pas devenir une lecture de `/etc/shadow`. Un lien qui reste dedans, lui, est une entrée comme une autre : `kind` dit `link`, et sa taille et sa date sont celles de ce qu'il désigne.

**Tout appartient au compte des projets.** `pupitred serve` tourne en root et redescend commande par commande ; un fichier ou un dossier créé par ces commandes appartient donc à ce compte, jamais à root, et un fichier réécrit garde le propriétaire et le mode qu'il avait. Un arbre où root aurait semé des fichiers serait un arbre que le client ne peut plus modifier depuis son propre terminal.

**Ce qui traverse le canal, et ce qui ne le traversera pas.** `fs.read` rend les octets sur des événements `file`, découpés en morceaux de 48 Kio et coupés sur un multiple de trois, comme `shots.read` : chaque `bytes` se décode seul, leur concaténation se décode aussi, et le `sha256` de la réponse dit sans ambiguïté si le fichier est entier. La lecture est plafonnée à 1 Mio pour un texte et à 16 Mio pour une image, et le refus tombe **avant** la lecture, sur la taille que le système de fichiers annonce. Le type est deviné par l'extension puis par le contenu : un fichier sans extension dont les octets sont de l'UTF-8 valide est du texte. Tout le reste — un PDF, une archive, un binaire — est refusé en `bad_request` avec un `fix` qui dit de le télécharger. C'est délibéré : le canal sert à montrer ce qu'on lit et à modifier ce qu'on écrit, pas à transporter des fichiers. Un vrai transfert demanderait un débit, une reprise et une progression qu'une suite de lignes JSON sur une session SSH ne saura jamais bien rendre ; il n'est pas du protocole (voir plus bas), et `fs.stat { hash: true }` existe pour ça — c'est l'empreinte qu'un transfert compare à l'arrivée, et elle est rendue même pour un type que la lecture refuse.

**Pourquoi une écriture porte une empreinte.** `fs.write` prend le contenu en base64 — le texte n'est pas le seul cas, et une ligne JSON ne porte pas un octet nul — et `sha256`, l'empreinte de la version que le lecteur a lue. Si le fichier a changé depuis, l'écriture est refusée avec un `fix` qui dit de relire : sur ce serveur, un agent peut écrire dans le même fichier entre la lecture et l'écriture, et une écriture aveugle effacerait ce qu'il vient de faire. Une écriture **sans** `sha256` crée un fichier qui n'existait pas, et rien d'autre : si le fichier est là, elle est refusée. L'écriture est atomique — le fichier est écrit à côté puis renommé — et plafonnée à 1 Mio.

**Les autres refus disent quoi faire.** Un dossier absent est une erreur et non une liste vide : contrairement à `completions`, qui ne doit pas faire échouer une frappe, le lecteur a demandé ce dossier-là. Un listing s'arrête à 2000 entrées et pose `truncated: true`. `fs.mkdir` est idempotent — un dossier déjà là n'est pas une erreur — et refuse quand un fichier porte ce nom. `fs.rename` refuse d'écraser une entrée existante, et rend `path`, la nouvelle place de l'entrée. `fs.remove` refuse un dossier qui n'est pas vide tant que `recursive` n'est pas demandé, et le refus dit combien d'entrées il contient ; `removed` compte ce qui est parti, le dossier lui-même compris.

## Ce que la signature d'une mise à jour couvre

La signature est **Ed25519, encodée en base64**. Elle porte sur ce message exact, terminé par un saut de ligne :

```
pupitred\n<version>\n<architecture>\n<empreinte SHA-256 en hexadécimal minuscule>\n
```

L'empreinte est celle du binaire téléchargé, calculée par l'agent lui-même sur les octets qu'il vient de recevoir. Lier ainsi l'empreinte à la version et à l'architecture refuse aussi un binaire authentiquement signé par nous mais publié pour une autre version ou une autre machine.

La clé publique correspondante est **embarquée dans le binaire à l'édition de liens**. Un agent construit sans clé refuse toute mise à jour : c'est le défaut sûr, et c'est voulu. Rien n'est écrit sur le disque avant que la vérification ne réussisse.

**L'empreinte et la signature viennent de la plateforme, pas de l'app.** L'agent lit `GET /api/v1/agent/release/:version/metadata` avec son jeton de serveur ; il en tire l'empreinte attendue et la signature, refuse un binaire dont l'empreinte diffère de celle annoncée, puis vérifie la signature. `signature` reste dans les paramètres comme secours, pour un agent dont la plateforme est injoignable ou trop ancienne pour servir cette route : quand la plateforme répond, c'est elle qui fait foi et le paramètre est ignoré. Une mise à jour sans paramètre `signature` est donc le cas normal.

Ce format est la référence commune de la chaîne de publication, de l'agent et de l'app. Le changer casse les trois à la fois.

## Le plancher de version

Une signature ne périme jamais : le binaire vulnérable d'hier reste signé demain. Sans garde-fou, qui tient le canal peut donc réinstaller une version ancienne et connue faillible. L'agent refuse de descendre.

**Le plancher est la plus haute de deux versions** : celle que l'agent exécute au moment de la demande, et `minimum_version` que `/api/v1/agent/state` annonce pour ce serveur. Une version strictement inférieure au plancher est refusée avec `downgrade_refused`, avant tout téléchargement.

La version courante est le plancher qui compte, parce que l'agent la connaît sans rien demander : elle tient quand la plateforme est injoignable, c'est-à-dire précisément quand un canal hostile a le plus de latitude. `minimum_version` est la mémoire de la plateforme — la dernière version qu'elle a vue tourner sur ce serveur — et sert le cas où le binaire a été remplacé sans l'accord de l'agent : celui qui redémarre en 0.9.0 se voit rappeler qu'on l'a connu en 1.4.0. Quand la plateforme ne répond pas, le plancher se réduit à la version courante, et la mise à jour vers l'avant reste possible : un agent périmé doit rester réparable.

`allow_downgrade: true` lève le plancher, et rien d'autre : la signature, l'empreinte, la version et l'architecture sont vérifiées comme toujours. C'est un geste explicite du propriétaire, que l'app ne compose pas seule ; le refus qui le précède porte le `fix` qui le nomme.

## Versionnage

`protocol` est un entier. Un champ ajouté à un résultat ne l'incrémente pas ; un champ retiré ou renommé, oui. Il ne dit rien de la forme des fichiers posés sur la machine, qui a son propre compteur — voir [migrations de configuration](./config-migrations.md). Un `hello` dont le `protocol` n'est pas celui de l'agent est refusé par `protocol_mismatch`.

La **feuille de compatibilité** dit lequel des deux mettre à jour. Elle vit dans `packages/shared/src/compat`, une ligne par génération de protocole — l'entier, la première version d'app et la première version d'agent qui le parlent — et voyage jusqu'à l'agent dans `schema.json`. Une pré-version appartient à la lignée qu'elle annonce : `0.2.0-beta.1` est de la génération de `0.2.0`.

Le refus de `hello` s'écrit avec elle : un agent d'une génération antérieure répond que c'est lui qu'il faut mettre à jour, et nomme la version minimale ; une app d'une génération antérieure s'entend dire l'inverse. Une version qui n'est pas du semver — un build de développement — n'est jugée par personne, et le message retombe sur les deux numéros de protocole.

Côté app, le bandeau de mise à jour lit la même feuille : un serveur d'une génération en arrière ne répond plus au protocole, donc `agent.upgrade` ne peut plus lui être demandé, et l'écran renvoie vers la réinstallation de l'agent plutôt que vers un bouton qui échouerait.

## Configuration en retard

Une configuration que le binaire ne lit pas n'est pas une configuration à deviner : un module à qui l'on passe des valeurs qu'il comprend de travers les réécrit de travers. Tant que `hello` rend un `config.state` autre que `current`, toute commande qui lit ou écrit une configuration est refusée en `migration_required`, avec le `fix` qui nomme le geste.

Onze commandes restent ouvertes — `hello`, `ping`, `snapshot`, `status`, `report`, `diag`, `doctor`, `agent.upgrade`, `agent.migrate`, `enroll`, `platform.sync` — exportées de `packages/shared` sous `MIGRATION_COMMANDS`. Un serveur qu'on ne peut pas regarder est un serveur qu'on ne peut pas réparer. Le détail est dans [migrations de configuration](./config-migrations.md).

## Mode restreint

Il y a deux situations, et elles n'ouvrent pas les mêmes commandes. Elles se cumulent avec le refus ci-dessus : un serveur restreint dont la configuration est en retard ne répond qu'à l'intersection des deux listes.

**Un serveur enrôlé qui a perdu la plateforme.** Sans droit d'usage valide depuis sept jours, `hello` renvoie `entitlement: "restricted"` et neuf commandes répondent : `hello`, `ping`, `snapshot`, `status`, `diag`, `agent.upgrade`, `agent.migrate`, `enroll` et `platform.sync`. Le client garde ainsi la vue de sa machine, le moyen de redemander à la plateforme ce qu'elle n'a pas confirmé, celui de réparer un agent périmé et de porter sa configuration à la forme que ce nouvel agent lit, et celui de réparer le serveur lui-même : un jeton perdu, un jeton révoqué ou un droit d'usage à rétablir se règlent par un ré-enrôlement depuis l'app, sans détour par la console. La sûreté ne bouge pas — un jeton d'enrôlement est signé par la plateforme pour un compte authentifié et un abonnement en cours, si bien qu'admettre `enroll` n'ouvre rien qu'un compte valide ne puisse déjà obtenir. Les autres commandes renvoient `entitlement_required` avec le lien vers la console. Rien de ce qui tourne ne s'arrête : tmux, les projets et les services continuent.

**Un binaire sans jeton de serveur**, copié sur une autre machine, n'ouvre que `hello`, `ping`, `diag` et `enroll`. Il n'a aucun serveur à décrire et rien à mettre à jour : pas de jeton, donc pas de fonctions. `enroll` est la porte par laquelle il en obtient un, et elle ne s'ouvre que sur un jeton d'enrôlement que la plateforme a signé pour cet appareil et ce compte. Ces quatre commandes sont exportées de `packages/shared` sous `UNENROLLED_COMMANDS`, la seule liste que l'app et l'agent lisent.

## Le transfert d'un fichier lourd n'est pas du protocole

Un dump de plusieurs Go, un dossier de médias, une archive : rien de cela ne passe par le canal de l'agent, plafonné à une ligne de quelques Mio en base64 et tout en mémoire. L'app lance un `rsync` séparé — `rsync -e "ssh -F <config de l'app>" --partial --append-verify --info=progress2 --no-inc-recursive` — sur sa propre configuration SSH, donc sur la session maître déjà ouverte : pas de seconde authentification, une reprise là où la coupure a eu lieu, et une progression lue sur la sortie de `rsync`. Quand `rsync` manque d'un côté, `scp -F <config>` porte le fichier d'un bloc et l'app compare taille et `sha256` par `fs.stat { hash: true }` à l'arrivée. Le chemin distant est relatif à la racine que `completions` nomme, comme pour `fs.*`, et validé par le processus principal ; le chemin local vient toujours d'une boîte de dialogue ou d'un dépôt de fichier, jamais d'une chaîne du renderer. L'agent n'y participe pas, et c'est voulu : un transfert ne demande rien au serveur qu'une session SSH ne fasse déjà.

## Le tunnel local d'un port n'est pas du protocole

`tunnel.*` s'adresse à l'exposition installée, quelle qu'elle soit — Cloudflare ou Caddy — et son rapport la nomme dans `provider`, `null` quand aucune ne tient la machine. Amener un port du serveur sur le laptop est autre chose, et cela reste l'affaire de l'app : elle ouvre un `ssh -L` sur son propre canal, avec sa configuration SSH et sa clé. L'agent n'y participe pas, et c'est voulu — un tunnel local ne demande rien au serveur qu'une session SSH ne fasse déjà, et lui donner une commande de protocole reviendrait à faire décider au serveur d'une écoute sur la machine du client.
