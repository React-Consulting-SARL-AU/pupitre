# Protocole app ↔ agent

Le canal est une session SSH ouverte par l'app avec la clé du client, qui lance `pupitred serve` — ou `pupitred serve --privileged`, voir [deux sessions](#deux-sessions--sans-mot-de-passe-et-privilégiée). L'app écrit une requête JSON par ligne sur l'entrée standard ; l'agent répond par une ligne JSON, ou par un flux d'événements puis une réponse. Les types vivent dans `packages/shared/src/agent-protocol/` et sont exportés en JSON Schema pour Go.

## Enveloppe

```jsonc
// requête
{ "id": 12, "cmd": "project.up", "params": { "name": "flyleaf-api" } }

// événement, zéro ou plusieurs, pour une commande longue
{ "id": 12, "event": "log", "line": "vite v7 ready in 412 ms" }

// réponse, exactement une
{ "id": 12, "ok": true, "result": { "state": "online", "port": 5173 } }
{ "id": 12, "ok": false, "error": { "code": "project_not_found", "message": "…", "fix": "…" } }
```

- `id` est choisi par l'app, croissant, jamais réutilisé dans une session.
- Une ligne, requête ou événement, ne dépasse pas quatre mébioctets — la plus grande ligne légale du protocole, un `fs.write`, en tient moins de la moitié. Chaque côté coupe au-delà : l'app ferme le canal, l'agent répond `bad_request` puis ferme la session.
- Les requêtes sont sérialisées côté app : une seule commande en vol par canal. Les commandes longues (`project.pull`, `project.sync`) ouvrent un second canal pour ne pas bloquer les lectures d'état, les lectures que l'app fait sur minuterie (`snapshot`, `processes.list`) un troisième, pour qu'un geste n'attende jamais derrière elles, et les journaux suivis (`project.logs`, `service.logs`) un quatrième : un suivi tient son canal tant que le lecteur reste, et rien de borné ne doit attendre derrière lui. Ces quatre canaux sont la session sans mot de passe ; ce que le contrat garde pour `--privileged` — `install` et `upgrade` compris — passe sur un cinquième, ouvert à la demande et refermé après une minute sans usage.
- Toute erreur porte un `code` stable, un `message` pour l'humain, un `fix` quand un remède existe, et un `remedy` quand ce remède tient dans une valeur.
- La première commande d'une session est `hello` ; l'agent refuse le reste tant qu'elle n'a pas eu lieu.
- **Une coupure emporte la session, pas la commande.** `pupitred serve` ignore la fermeture de ses descripteurs : `install`, `upgrade` et `harden` vont jusqu'au bout sans personne pour les lire, le rapport est écrit avant chaque étape, et un verrou sur `/var/lib/pupitre/install.lock` fait refuser `busy` à toute autre session — ou à `pupitred install` sur la machine — tant que cette exécution dure. L'app, elle, rouvre le canal aussi longtemps que la commande avait de temps, rejoue les étapes que le canal n'a pas portées d'après le rapport, et le relit jusqu'à `finished_at`. Un rapport daté d'avant la demande est celui d'une autre exécution : la coupure reste alors la seule vérité à dire, et `busy` en réponse à un `install` se suit comme une installation en cours.
- **Les commandes de projet, elles, meurent avec leur canal.** `project.install`, `project.sync` et `project.pull` partagent le verrou de `/var/lib/pupitre/project-install.lock` : une seconde exécution — d'une autre session, chaque canal étant son propre processus — répond `busy` plutôt que de travailler les mêmes dossiers. Et leur travail s'arrête avec le canal qui l'a demandé : une coupure au milieu d'un `bun install` l'interrompt, au lieu de le laisser tourner invisible et inarrêtable ; un gestionnaire de paquets reprend là où le sien s'était arrêté.

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

Tout ce qui suit est dans le contrat et répond sur `pupitred serve --privileged` ; `pupitred serve` n'en répond qu'une partie, voir [deux sessions](#deux-sessions--sans-mot-de-passe-et-privilégiée). Neuf commandes ne sont appelées par aucun écran de l'app aujourd'hui : `status`, `doctor`, `diag`, `project.debug`, `sessions.list`, `secrets.sync`, `keys.list`, `keys.sync` et `tunnel.restart`. `status` et `doctor` s'obtiennent aussi sur la machine par `pupitred dev status` et `pupitred dev doctor` ; les autres n'ont que le protocole.

Chaque réponse est tenue à `<Commande>Result` de `schema.json` (`contract.ResultDefinition`) : `cmd/pupitred/contract_test.go` appelle chaque commande que le serveur de production sert et échoue sur une commande sans cas, sauf les exclusions qu'il nomme avec la raison et l'endroit où leur résultat est vérifié ; les transcriptions de `modtest` valident chaque réponse `ok` et chaque événement contre leur définition et échouent sur une commande ou un événement qui n'en a pas.

### Session

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `hello` | `{ app_version, protocol, locale? }` | `{ agent_version, protocol, server_id?, entitlement: "valid" \| "grace" \| "restricted" \| "dev", capabilities[], config? }`. Un `protocol` incompatible renvoie `protocol_mismatch` avec la version attendue. `locale` vaut `fr` ou `en` — les langues que le produit sert — et vaut pour toute la session : l'agent répond dans cette langue quand il la connaît, dans la sienne sinon. Jamais une erreur, jamais un champ vide. Un agent d'une version antérieure ignore le champ et répond comme avant ; la version de protocole ne bouge donc pas. `server_id` est l'identifiant du serveur sur la plateforme, dès que le daemon l'a lu de `/agent/state` et gardé dans `/etc/pupitre/server.id` ; absent avant. `config` dit où en est la configuration de la machine face au binaire qui la lit — `{ revision, expected, state }` — et voir [migrations de configuration](./config-migrations.md) ; un agent antérieur au registre ne le rend pas, et l'app tient alors la configuration pour courante |
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
| `harden.sudo` | `{ user: "dev", secrets_stdin: true }`, puis la ligne `{ password_hash }` | événements `step`, puis `{ sudo: "password" }`. Donne à `dev` le mot de passe dont l'app a calculé l'empreinte, puis ne lui laisse sans mot de passe que `pupitred` ([décision 0015](../decisions/0015-sudo-par-mot-de-passe.md)) ; voir [le mot de passe sudo](#le-mot-de-passe-sudo) |
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
| `snapshot` | `{ machine, services[], projects[], sessions[], entitlement }` en un appel, chaque projet avec ses `processes[]`. C'est ce que le tableau de bord lit toutes les 3 secondes. `machine.sudo` dit ce que sudo demande à `dev` : `password` sous la règle de `harden.sudo`, `nopasswd_all` sous celle d'avant ; absent pour toute autre règle, et d'un agent antérieur au champ |
| `status` | `{ services[], projects[] }` allégé |
| `service.status` `{ id }` | état, version, port, identifiants (masqués), unité systemd, `versions[]` pour un runtime tenu à plusieurs majeures, `path` quand le poste du lecteur doit pointer un dossier que le module a posé (le backend qu'ouvre JetBrains Gateway), et `login` pour un module dont le CLI se connecte à un compte |
| `completions` `{ path? }` | de quoi compléter une ligne de terminal : `{ command, sub[], projects[], root, path, paths[] }` |

`completions` répond en une fois aux trois questions d'une autocomplétion, pour que l'app n'ait rien à deviner :

| Champ | Type | Description |
| --- | --- | --- |
| `command` | `string` | le nom sous lequel les commandes de pilotage s'appellent sur ce serveur : `dev`, c'est-à-dire `pupitred dev` |
| `sub[]` | `{ name, help, args }` | la grammaire : un verbe, son aide, et une liste de valeurs par position d'argument. `$project` est un joker que l'app remplace par `projects[]` ; `$process` en est un que l'app remplace par les processus du projet tapé juste avant — `dev up intranet server`, `dev logs intranet client` — et qu'un projet d'un seul processus laisse tomber, le verbe prenant alors son premier |
| `projects[]` | `string[]` | les projets réels du registre, dans son ordre |
| `root` | `string` | la racine des projets, le seul dossier que `completions` lit |
| `path` | `string` | le dossier effectivement listé, relatif à `root` ; vide pour la racine |
| `paths[]` | `string[]` | les entrées de ce dossier, relatives à lui, les dossiers avec une barre oblique finale |

`path` est relatif à `root` : un chemin absolu ou un `..` qui sort de la racine renvoie `bad_request`. Un dossier absent renvoie `paths: []` et non une erreur — une complétion ne fait pas échouer une frappe.

Un `Project` est un dépôt, ou un dossier, et porte ce qui y tourne : `processes[]`, un au moins. Le projet tient le nom, le dossier, le dépôt et la branche — tout ce qui est git ; chaque `Process` tient un `id`, son propre dossier `dir` relatif au projet (`.` pour la racine), son gestionnaire de paquets, sa commande de démarrage, sa ligne d'installation, son hôte, son port principal et ses `routes[]`. Le cas d'un dépôt qui tient un serveur Grails et son client React est le cas général : un projet `intranet`, un processus `server` à la racine sous gradle, un processus `client` dans `client/` sous pnpm, chacun sur son port et dans sa propre fenêtre tmux. Un projet d'un seul processus — le cas le plus fréquent — a la même forme, avec une liste d'un élément.

Un `Project` porte deux chemins. `dir` est le dossier déclaré dans le registre, relatif à la racine des projets du serveur, et c'est lui que `project.add` prend en paramètre. `path` est ce même dossier en absolu, résolu par l'agent : `/home/dev/projects/intranet`. C'est `path` qu'on ouvre dans l'éditeur distant, où l'on démarre un terminal et où `agent.open` lance un agent : à la racine du dépôt, quel que soit le sous-dossier de ses processus. Chaque `Process` porte de même son `path`, absolu, sous celui du projet.

Le chemin absolu vit sur le projet, pas sur la machine : `status`, `project.list` et `project.add` rendent des projets sans rendre de `machine`, et l'app n'aurait pas de racine à recoller. Elle ne concatène donc jamais rien — la racine des projets n'est pas dans le contrat, c'est un détail du serveur.

`path` est toujours présent et toujours dans la racine des projets, versionné ou non : l'agent le résout puis vérifie la contenance, et une ligne de registre qui viserait ailleurs — ou dont un processus sortirait du dossier du projet — n'est pas un projet : elle ne sort pas de `project.list`. Quand le projet est un dépôt git, `path` est cohérent avec le `root` que rend `project.git_status` : ce dernier est la racine que git déclare, qui vaut `path` ou l'un de ses parents à l'intérieur de la racine des projets, jamais au-dessus.

### Projets

| Commande | Paramètres |
| --- | --- |
| `project.list` | — |
| `project.add` | `{ name, dir, repo?, branch?, boot?, runtimes?, protected?, processes[] }` : `protected` absent vaut `true` ; chaque processus porte `{ id, dir?, pkgmgr, host, port, routes[], cmd, install?, protected? }`, `protected` absent suivant le projet ; chaque route `{ label, port, subdomain? }` ; `dir` absent vaut `.`. Un projet avec `repo` ne crée aucun dossier — le clone les apporte — et refuse en `bad_request`, avant d'écrire sa ligne, un dossier déjà là qui n'est ni vide ni un clone de ce même dépôt ; un projet sans `repo` reçoit le dossier de chacun de ses processus |
| `project.detect` | `{ repo, branch? }` ou `{ dir }` : ce qu'un dépôt demande, sans rien installer |
| `project.update` | `{ name, patch }` avec `patch: { branch?, boot?, runtimes?, protected?, processes? }` : réécrit la ligne du projet et répond le `Project` mis à jour. Comme `project.add`, la réponse porte `warnings[]` quand une étape a refusé une fois la ligne écrite — un dossier qui ne se crée pas, une épingle de runtime, un démarrage : la ligne tient, l'app montre les phrases comme des avertissements, et un second `add` répondrait que le projet est déjà déclaré |
| `project.remove` | `{ name }` (le dossier reste) |
| `project.up` / `project.down` / `project.restart` | `{ name \| "all", process? }` : tous les processus du projet, ou celui que `process` nomme ; `all` n'en nomme aucun |
| `project.logs` | `{ name, process, lines?, follow? }` → événements `log` si `follow` : le journal d'un processus, jamais du projet entier. Le journal est capturé sur la fenêtre tmux, séquences d'échappement comprises : c'est à l'app de les interpréter. Chaque démarrage y écrit `=== pupitre up <RFC 3339> ===` sur sa propre ligne, chaque arrêt `=== pupitre down <RFC 3339> ===` ; un démarrage vide le journal avant d'écrire. Un suivi survit à l'arrêt et au redémarrage du processus — il relit le journal depuis son premier octet quand celui-ci raccourcit — et ne s'arrête qu'avec le canal ou son propre quart d'heure. Une ligne ne voyage qu'entière : ce qui est lu avant son saut de ligne attend la suite — sauf à dépasser 64 Kio sans saut de ligne, où elle part telle quelle plutôt que de croître sans borne ; une rafale plus large qu'un mébioctet ne livre que sa fin |
| `project.pull` | `{ name }` → `{ pulled, state }` : clone si le dossier n'a pas de dépôt, `pull --rebase --autostash` sinon, et rien d'autre ; `pulled` est faux pour un dossier sans dépôt. Un dossier gardé d'un projet retiré est repris tel quel : s'il tient déjà un dépôt dont l'`origin` n'est pas celui que la ligne déclare — à la forme d'écriture près, schéma, compte, `.git` — la commande refuse en `bad_request` en nommant les deux, et ne tire rien ; s'il est plein sans dépôt, le clone refuse avec les mots de git. C'est la phase « sources » de l'ajout d'un projet, l'installation venant ensuite par `project.install`. Partage le verrou d'installation : `busy` si une exécution tient déjà la machine |
| `project.sync` | `{ name }` → événements `log` pendant l'installation, puis `{ pulled, installed, state }` : `project.pull` puis `project.install` en une commande, le geste de synchronisation de l'écran d'un projet — un seul `pull`, une installation par processus. S'arrête avec son canal, sous le verrou d'installation : `busy` répond à toute exécution concurrente |
| `project.install` | `{ name, process? }` → événements `log { line }` pendant que la commande d'installation tourne, puis `{ done, installed[] }` : `installed` liste `{ process, command }` pour chaque processus dont la ligne d'installation a tourné, `bun install` par exemple ; un processus qui n'en déclare aucune n'y figure pas. La commande s'arrête avec son canal — une coupure interrompt l'installation — et répond `busy` à toute exécution concurrente, sous `/var/lib/pupitre/project-install.lock` |
| `project.env` | `{ name, process?, force? }` → `{ path, written, keys[], template }` : écrit `.env.local` à la racine du projet, ou dans le dossier du processus nommé, depuis `.env.1password.tpl` ou `.env.example` ; `keys` ne porte que des noms, jamais une valeur ; `template` dit si le dépôt versionne l'un des deux gabarits. Un fichier déjà là est lu, pas réécrit, sauf `force`. Un dépôt sans gabarit n'est pas une erreur : `template: false`, `keys: []` si rien n'a jamais été écrit — un projet peut n'avoir aucun environnement |
| `project.branches` | `{ name }` |
| `project.checkout` | `{ name, branch }` |
| `project.git_status` | `{ name }` : `behind`, `ahead`, `dirty`, `changed`, `last`, `subject`, `problem` |
| `project.working_tree` | `{ name }` : fichiers changés |
| `project.diff` | `{ name, path }` : le patch brut |
| `project.url` | `{ name }` |
| `project.debug` | `{ name, process }` : redémarrage d'un processus avec l'agent de débogage JVM → `{ state, port, debug_port }` |

#### Un processus, une fenêtre, un état

Chaque processus tourne dans sa propre fenêtre tmux, nommée `<projet>/<processus>` — ni un nom de projet ni un identifiant de processus n'admet une barre oblique, si bien qu'une fenêtre se relit sans ambiguïté — et écrit son journal sous `~/.pupitre/logs/<projet>/<processus>.log`. L'identifiant d'un processus est une étiquette DNS, comme le libellé d'une route.

Un `Process` porte son propre `state`, lu sur sa fenêtre et son port principal : `online`, `starting`, `failed`, `stopped`, `down`, `external`, `service`. La fenêtre exécute la commande elle-même, dans le shell de connexion de l'utilisateur, et tmux garde le panneau une fois la commande sortie : un processus dont la commande s'est terminée n'est jamais `starting` — il est `stopped` si elle a rendu 0, `failed` sinon ou si un signal l'a tuée. `starting` ne dit donc qu'une chose : la commande tourne et le port déclaré ne répond pas encore. `project.up` répond dès la fenêtre ouverte, avec cet état-là ; ce qui suit se lit sur `project.list` ou `snapshot`. `project.up` et `project.restart` remplacent un panneau mort, `project.down` le ferme.

Ce qui tourne survit au redémarrage de la machine. Chaque démarrage inscrit sa fenêtre dans `/var/lib/pupitre/projects.running.json`, chaque arrêt — `project.down`, un processus retiré par `project.update`, `project.remove` — l'en retire : le fichier dit ce que le lecteur veut voir tourner, pas ce que la machine exécute. Un projet peut aussi demander à **démarrer avec le serveur** : `boot` sur sa ligne, posé par `project.add` et changé par `project.update`, faux tant que personne ne l'a demandé (migration n° 3 pour les lignes d'avant). Au boot, l'unité `pupitre-resume.service` (un `oneshot` posé par `core.system`, à part du démon dont le `/tmp` privé cacherait la socket tmux) lance `pupitred resume`, qui relance chaque fenêtre inscrite encore déclarée puis chaque processus des projets marqués `boot`, et laisse les autres ; la session tmux existante — un démon redémarré pour une mise à jour — le fait se taire. Un processus mort de lui-même avant l'extinction est relancé comme les autres : le vœu de le voir tourner n'a pas changé. Le `state` du projet s'en déduit, du pire au meilleur : `failed` si un processus a échoué, `starting` si un démarre, `online` si tous tournent, **`partial`** si certains seulement, `stopped` sinon. `partial` est le seul état qu'un processus n'a jamais de lui-même. Un processus `service` est l'affaire de systemd, comme avant : ni le projet ni `all` ne le démarrent ni ne l'arrêtent, et un projet qui n'en tient que de tels est `service`.

Le `url` d'un processus est celle de la route de son port principal quand elle porte un nom sur le web, son adresse locale sinon ; le `url` du projet est celle du premier processus publié, et à défaut l'adresse locale du premier. Cette adresse est celle que la machine voit : l'app n'ouvre depuis l'ordinateur du lecteur qu'une adresse en `https://`, et montre l'autre pour ce qu'elle est. `pid`, `ram_mb` et `uptime_s` vivent sur chaque processus.

#### Le port de débogage vient de la machine

`project.debug` arrête le processus puis le relance en ajoutant `-PdebugPort=<port>` à sa propre commande, et répond l'état, le port du processus et le port de débogage. Ce port n'écoute que sur la boucle locale : il revient par la session SSH comme la base de données, rien de neuf ne s'ouvre sur le pare-feu. `project.restart` remet le processus sur un démarrage normal ; il n'y a pas de second paramètre pour ça.

Quels processus sont débogables et sur quel port se lit dans `/etc/pupitre/env`, jamais dans le binaire, une entrée par fenêtre :

```
PUPITRE_DEBUG_PORTS="intranet/server:5005 flyleaf/worker:5006"
```

Les guillemets sont ceux de systemd, qui lit ce fichier comme `EnvironmentFile` : sans eux, une valeur à espaces ne serait plus une seule variable. Un processus absent de la liste est refusé en `bad_request`, avec la ligne à écrire dans le `fix` ; un processus `service`, qui appartient à systemd et non à une fenêtre tmux, l'est aussi.

#### L'environnement d'un projet vient du registre

Ce que Pupitre sait d'un projet — son port, ses adresses, celles de ses voisins — arrive dans son environnement, préfixé `PUPITRE_`, pour qu'un script le lise au lieu de le figer. Ces noms sont un contrat avec le code des clients : on en ajoute, on n'en renomme ni n'en retire aucun.

| Variable | Valeur | Où |
| --- | --- | --- |
| `PUPITRE` | `1` | partout |
| `PUPITRE_PROJECTS_DIR` | la racine des projets, `/home/dev/projects` | partout |
| `PUPITRE_DOMAIN` | le domaine que le serveur publie, absent sans exposition | partout |
| `PUPITRE_PROJECT` | le nom du projet | projet |
| `PUPITRE_PROJECT_DIR` | le dossier du projet, absolu | projet |
| `PUPITRE_PROJECT_URL` | le `url` du projet | projet |
| `PUPITRE_PROCESS_<ID>_PORT` | le port principal de chaque processus du projet | projet |
| `PUPITRE_PROCESS_<ID>_URL` | le `url` de chaque processus du projet | projet |
| `PUPITRE_PROCESS` | l'identifiant du processus | processus |
| `PUPITRE_PROCESS_DIR` | le dossier du processus, absolu | processus |
| `PUPITRE_HOST` / `PUPITRE_PORT` | l'hôte et le port principal où lier le serveur | processus |
| `PUPITRE_URL` | le `url` du processus : publique si elle existe, locale sinon | processus |
| `PUPITRE_LOCAL_URL` | `http://<host>:<port>` | processus |
| `PUPITRE_PUBLIC_URL` | `https://<hostname>` de la route principale, absent si elle n'est pas publiée | processus |
| `PUPITRE_ROUTE_<LABEL>_PORT` / `_URL` | le port de chaque route du processus, et son adresse : publique si elle porte un nom, locale sinon | processus |

`<ID>` et `<LABEL>` sont l'identifiant ou le libellé en majuscules, tiret changé en souligné : `api-v2` donne `PUPITRE_PROCESS_API_V2_URL`. Les deux sont des étiquettes DNS, si bien que deux processus ne se partagent jamais un nom, et les préfixes `PROCESS_` et `ROUTE_` tiennent un processus nommé `public` à l'écart de `PUPITRE_PUBLIC_URL`. Aucun secret n'y passe : le jeton 1Password et les clés restent où ils sont.

**Un processus reçoit tout, au démarrage.** `project.up`, `project.restart`, `project.debug`, la reprise au boot et un redémarrage par `project.update` ouvrent la fenêtre avec `tmux new-window -e` pour chaque variable des trois niveaux, calculées depuis le registre à cet instant. `PORT` et `HOST` ne sont jamais posés : une variable injectée l'emporterait sur le `.env.local` du dépôt, et Pupitre changerait en silence un projet qui marchait. Le client écrit `--port $PUPITRE_PORT` s'il le veut.

**Un processus lancé garde ce qu'il a reçu.** La fenêtre retient l'empreinte de son environnement dans l'option `@pupitre_env`. Quand le registre donnerait autre chose — un domaine déplacé, une route publiée, un port changé, un voisin ajouté —, le `Process` d'un processus qui tourne porte **`env_changed: true`**, et l'app propose de le redémarrer. Rien ne redémarre seul. Une fenêtre sans empreinte, ouverte avant que l'agent ne la pose, n'est jamais `env_changed`.

**Un terminal suit son dossier.** L'agent écrit ce que chaque dossier reçoit dans `~/.pupitre/environment.json`, propriété de `dev` : à chaque écriture du registre et à chaque `snapshot` qui le trouve en retard. Le bloc `core.system` de `.zshrc` et de `.bashrc` exporte `PUPITRE=1` et `PUPITRE_PROJECTS_DIR`, puis évalue `pupitred env` avant chaque invite — et, sous zsh, à chaque changement de dossier. `pupitred env` tourne en `dev`, ne lit que ce fichier, choisit le dossier déclaré le plus profond qui contient le dossier courant — celui d'un processus, puis celui d'un projet, puis la machine — et imprime des `export` et des `unset` : ce qui ne s'applique plus au nouveau dossier part, sous le suivi de `_PUPITRE_ENV_KEYS`. Un fichier absent ou illisible n'imprime rien. Un agent ouvert par `agent.open` reçoit l'environnement du projet par `new-session -e`, comme une fenêtre de processus.

#### Ce qu'un dépôt demande, avant de l'ajouter

`project.detect` répond à ce que l'écran d'ajout doit deviner avant `project.add` : quels processus, et pour chacun quel gestionnaire de paquets, quelle commande de démarrage, quel port. Elle prend **une seule** source — `repo` pour un dépôt que le serveur ne connaît pas encore, `dir` pour un dossier déjà présent sous la racine des projets — et le contrat refuse les deux à la fois comme aucun des deux.

Elle n'installe rien et ne déclare rien. Un `repo` est cloné **en surface et en partie** — `--depth 1`, sans étiquettes, `--filter=blob:limit=65536` et `--no-checkout` : les arbres et les petits blobs arrivent en un seul paquet, et seuls les fichiers que la détection lit sont écrits (`package.json`, `turbo.json`, `pnpm-workspace.yaml`, `vite.config.*`, les fichiers de verrou, `pyproject.toml`, `gradlew`, `settings.gradle*`, `build.gradle*`, jusqu'à deux dossiers de profondeur pour les membres d'un workspace, et la configuration d'un serveur — `grails-app/conf/application.yml`, `src/main/resources/application.yml` ou `.properties` — à la profondeur où elle est). Un dépôt lourd d'images ou d'historique coûte ce que coûte un dépôt vide ; un serveur qui ne connaît pas le filtre le dit et envoie tout, ce qui se lit pareil. Le clone va dans le cache de l'utilisateur des projets, `~/.cache/pupitre/detect/<tirage>`, jamais sous la racine des projets : un clone à moitié fait ne doit pas pouvoir passer pour un projet. Le dossier est effacé dès la lecture finie, que la lecture ait réussi ou non. Chaque détection tire son propre nom, si bien que deux détections simultanées ne se marchent pas dessus ; et comme un agent tué en plein clone n'efface rien, chaque détection balaie d'abord ce que le cache garde depuis plus d'une heure — un âge qu'aucun clone en vol ne peut atteindre.

Le résultat est `{ processes[] }`, un par dossier qui demande quelque chose : la racine, puis chaque dossier de premier niveau qui porte son propre manifeste — un `package.json`, un `pyproject.toml`, ou un `gradlew` à lui. Un dépôt qui ne demande rien rend un processus sans commande, à la racine. Chaque processus porte :

| Champ | Description |
| --- | --- |
| `id` | le nom du manifeste replié en étiquette DNS, le nom du dossier sinon, `app` pour une racine sans nom ; le nom du sous-projet pour un serveur Gradle |
| `dir` | le dossier, relatif à la racine ; `.` pour elle |
| `pkgmgr` | ce que le dossier prouve : le champ `packageManager` du `package.json`, sinon son fichier de verrou (`bun.lock`, `pnpm-lock.yaml`, `package-lock.json`), sinon `bun` pour un `package.json` sans verrou. Sans `package.json` : `uv` pour un `pyproject.toml`, `gradle` pour un `gradlew`, `none` sinon |
| `install` | la commande d'installation de ce gestionnaire, absente quand il n'en a pas |
| `cmd` | la commande de démarrage : le premier script `dev`, `start` ou `serve` du `package.json`, sur le port de `port_hint`. Absente quand le dossier n'en déclare aucun |
| `port_hint` | le port que le dossier demande — le `--port` de son script, le `server.port` de sa configuration Vite — s'il est libre sur ce serveur et qu'aucun autre processus de la même détection ne le demande ; sinon le premier port libre du registre. Un script qui ne fait que lancer un autre script (`"dev": "bun run dev:app"`) se lit au bout de la chaîne, cinq sauts au plus |
| `host_hint` | le nom en `.localhost` que le script de démarrage fige dans son `--host` (`react-box.localhost`), quand il en fige un. C'est le `host` à déclarer : un tel nom ne se résout pas de lui-même sur un serveur, et un serveur de développement qui s'y lie sans réponse attend sans fin |
| `routes` | les ports des workspaces d'un monorepo, quand la racine les lance tous d'un coup |

**Un build Gradle tourne d'où est son wrapper.** Un dossier qui tient un `gradlew` propose un processus par serveur que le build déclare : le build lui-même quand son `build.gradle` nomme Spring Boot ou Grails, et chacun des sous-projets que `settings.gradle` inclut dont le fichier de build les nomme — `./gradlew :server:bootRun`, depuis le dossier du wrapper. Le port proposé est celui que la configuration du serveur déclare (`server.port`) quand il est libre, puisque son client est écrit contre lui, le prochain libre sinon. Un build Android n'en nomme aucun et ne propose rien ; un dossier qui tient un `build.gradle` sans wrapper est un sous-projet du build au-dessus, pas un processus.

Rien de tout cela n'est une décision : la détection propose, le client corrige à l'écran — retire le processus d'un outil qu'on ne lance pas sur un serveur, change un port qu'un proxy impose — et `project.add` reste l'autorité, c'est lui qui refuse un port déjà pris, avec le remède qui porte le port libre.

**Le `host` d'un processus est `127.0.0.1`, ou un nom en `.localhost` que la machine fait répondre.** Un dépôt qui fige `--host react-box.localhost` dans son script suppose ce que le portable du client fait seul — résoudre `*.localhost` sur la boucle locale — et qu'un serveur ne fait pas. L'agent tient donc dans `/etc/hosts` un bloc balisé `projects`, réécrit à chaque `project.add`, `project.update` et `project.remove` : une ligne `127.0.0.1 <host>` par processus dont le `host` finit en `.localhost`, en IPv4 seulement, pour que le serveur de développement se lie là où le port est sondé et où le tunnel frappe. Tout `host` qui n'est ni `127.0.0.1` ni un nom en `.localhost` est refusé en `bad_request`.

#### Un processus, une commande, plusieurs ports

Un `Process` tient un port principal, `port` — c'est lui qui décide de l'état `online` et de l'adresse locale — et une liste `routes[]` : chaque port que l'écran a relevé, `{ label, port, hostname? }`. `label` est un mot court, une seule étiquette DNS : `web`, `api`, `docs`. `hostname` est le nom **complet** sous lequel ce port répond sur le web, tel que le registre le garde ; une route sans `hostname` est un port que personne ne publie. Le cas Turborepo reste un seul processus : `turbo run dev` lance `web`, `api` et `docs` dans une seule fenêtre, et le processus porte trois routes.

**Le nom d'hôte se résout une fois, à l'ajout, et se stocke.** `project.add` reçoit des routes `{ label, port, subdomain? }` ; pour chaque `subdomain`, l'agent compose `<subdomain>.<domaine>` à partir du domaine que le serveur publie — celui que le module d'exposition a écrit dans `PUPITRE_DOMAIN` — et garde le résultat. Un serveur sans domaine refuse une route qui porte un `subdomain`, avec le `fix` qui dit d'installer une exposition ou de laisser le port sans nom. Rien, ensuite, ne recompose une adresse depuis un sous-domaine : `url` se lit sur le `hostname` stocké de la route principale, celle dont le port est `port`. **Un domaine qui change emporte tous les noms** : quand le module d'exposition reçoit un autre `domain`, son étape `move-routes` réécrit chaque `hostname` du registre qui finissait par l'ancien domaine sous le nouveau, avant d'enregistrer le domaine et d'écrire l'ingress — un projet ne répond jamais sous un domaine que le serveur ne publie plus. Les enregistrements DNS, eux, sont l'affaire de l'app : elle relève les noms d'avant, retire ceux qu'elle avait écrits, et pose les nouveaux.

Le schéma de nommage est celui que l'app propose : `<sous-domaine>.<domaine>` pour la route principale du premier processus, `<label>-<sous-domaine>.<domaine>` pour toutes les autres, celles des autres processus comprises. C'est une proposition de l'écran, pas une règle de l'agent — chaque route reçoit le sous-domaine que le client a laissé dans son champ.

Le registre refuse un port déjà tenu par un projet du serveur, principal ou de route, avec le port libre dans le remède ; deux processus d'un même projet sur un même port ; deux processus d'un même projet sous le même `id` ; un nom d'hôte déjà pris ; deux routes du même processus sous le même libellé ; un `hostname` qui n'est pas sous le domaine du serveur — le tunnel et le DNS de cette machine ne portent rien d'autre ; et un second projet sur le dossier d'un premier — un dossier est un projet, ce qui y tourne en plus est un processus de plus.

`project.detect` sait lire un monorepo : un `turbo.json` à la racine et des `workspaces` dans le `package.json` — ou un `pnpm-workspace.yaml` — font proposer un seul processus, `cmd = turbo run dev` sous le gestionnaire détecté et une route par workspace dont le script `dev`, `start` ou `serve` nomme un port, libellée du nom du workspace, sur un port libre du serveur ; les dossiers de premier niveau ne sont alors pas lus, les workspaces sont déjà là. Comme le reste, il propose, et `project.add` reste l'autorité.

#### La configuration se rouvre

`project.update { name, patch }` change ce qui peut l'être sans retirer le projet : `branch`, `processes`. Un champ absent du `patch` reste ce qu'il était. `processes` **remplace la liste entière** — l'écran envoie ce qu'il montre, et un processus qui n'y est plus est un processus qui part, arrêté s'il tournait — et chaque processus porte ses routes entières, `{ label, port, subdomain? | hostname? }` : `subdomain` pour laisser l'agent composer le nom, `hostname` complet pour qui veut autre chose sous le domaine du serveur, jamais les deux. Un `install` vide rend la commande au gestionnaire de paquets.

La commande **redémarre un processus seulement si sa commande ou son dossier a changé et qu'il tournait**, lui et lui seul : une route, une branche, un processus ajouté à côté ne touchent à rien de ce qui tourne — le nouveau est déclaré, pas démarré. Elle répond le `Project` mis à jour, et refuse une ligne qui vient du `projects.conf` du dépôt, comme `project.remove`. Ce qu'un nom d'hôte retiré laisse derrière lui — l'enregistrement DNS — est l'affaire de l'app, qui l'a écrit : elle compare les noms d'avant et d'après, retire ceux qui partent, puis demande `tunnel.sync`.

#### La version d'un runtime, par projet

Un projet nomme la version de chaque runtime qu'il veut, par outil mise : `runtimes: { node: "22", java: "17" }`, posé par `project.add`, remplacé entier par `project.update` — un outil absent de la carte revient au défaut de la machine — et rendu sur chaque `Project`, `{}` quand il ne nomme rien (migration n° 5 pour les lignes d'avant). Les outils sont ceux de `RUNTIME_TOOLS` dans `packages/shared`, et la version est l'une des `versions[]` que le service `runtime.<outil>` rend : une version que la machine ne tient pas est refusée en `bad_request`, avec le `fix` qui nomme le service où la cocher.

L'agent tient l'épingle là où mise la lit : un `mise.local.toml` à la racine du projet, `[tools]` avec un outil par ligne, écrit à `project.add` quand le dossier est là, sinon avec le clone, réécrit à chaque `project.update` qui touche `runtimes`, retiré quand la carte se vide. Le fichier est le sien : `.git/info/exclude` le cache au diff du projet comme au dépôt, et `mise trust` le déclare à mise. Il prime sur tout ce que le dépôt déclare, et vaut pour les processus lancés par l'agent — `zsh -lc` dans le dossier du projet — comme pour les terminaux qu'on y ouvre.

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
| `tunnel.status` / `tunnel.sync` / `tunnel.restart` | — ; chaque route porte `protected`. Voir [Le portier d'accès](#le-portier-daccès) |
| `access.list` | — → `{ keys: [{ id, name, projects, created_at }] }`, sans empreinte |
| `access.create` | `{ id, name, hash, projects }` : `hash` est l'empreinte SHA-256 de la clé entière, `projects` une liste ou `null` pour tout le serveur → la clé listée ; un `id` déjà pris refuse en `bad_request` |
| `access.update` | `{ id, name?, projects? }` : un champ absent reste, `projects: null` ouvre tout le serveur |
| `access.revoke` | `{ id }` → `{ id }` ; une clé déjà partie répond aussi |

### Sauvegardes

Le format, le chiffrement et le déroulé sont dans [backups.md](./backups.md). Aucune de ces commandes n'est ouverte en mode restreint, avant l'enrôlement ou pendant une migration en retard. Celles qui lisent un seau annoncent `secrets_stdin: true` et lisent la ligne `BackupSecrets` — `{ access_key_id, secret_access_key, private_key? }` — juste après la requête, comme `install`.

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `backup.status` | — | `{ configured, interval_hours, keep, next_run_at?, running, last?: { at, ok, id?, bytes?, error?, warnings? } }` |
| `backup.contents` | — | `{ projects[]: { name, repo, included }, databases[]: { engine, name, item, included }, unreadable[] }` : ce que ce serveur tient et que les sauvegardes peuvent emporter, chacun avec son état d'après `exclude_projects`, `exclude_databases` et les interrupteurs `projects` et `databases`. Un moteur qui ne répond pas est nommé dans `unreadable` au lieu de faire échouer la liste. Répond aussi sans `core.backup` installé : tout y est alors `included` |
| `backup.run` | `{ name?, databases?, projects? }` : le nom que le lecteur donne à la sauvegarde, et de quoi dévier du réglage, une fois ; un nom hors du contrat est refusé `bad_request` | événements `step` du module `core.backup`, puis `{ id, key, bytes, parts[], warnings[], declared }`. Refus `busy` quand une sauvegarde ou une installation tient le verrou, `module_not_found` sans `core.backup` configuré, `storage_refused` quand le seau refuse |
| `backup.delete` | `{ id }` | efface les objets de cette sauvegarde de ce serveur dans le seau, puis la référence sur la plateforme : `{ deleted }` |
| `backup.inspect` | `{ location, secrets_stdin: true }` | le manifeste, vérifié contre `location.sha256`. `backup_missing` sans manifeste, `backup_corrupt` sur une empreinte qui diffère, `backup_unsupported` sur un format que ce binaire ne lit pas |
| `backup.restore.setup` | `{ location, revert?, secrets_stdin: true }` — la ligne porte `private_key` | `{ id, modules[], defer[], extra[], projects[], dropped[], parts[], warnings[] }`. Sans `revert`, refus `bad_request` sur une machine déjà installée ; `backup_unsupported` sur une configuration plus récente que ce binaire |
| `backup.restore.data` | `{ location, parts[], start?, secrets_stdin: true }` — la ligne porte `private_key` | une étape par partie, puis `{ restored[], failed[], started[], warnings[] }` |
| `backup.restore.abort` | — | `{ done: true }` |

### Système

| Commande | Paramètres |
| --- | --- |
| `enroll` | `{ platform_url, secrets_stdin: true }` : le jeton d'enrôlement est lu sur le flux secret ; l'agent l'échange contre son jeton de serveur, écrit `platform_url` dans `/etc/pupitre/platform.url` — le battement de cœur et le droit d'usage tournent sans l'app, et rien d'autre ne leur dirait où répondre — puis lit `/agent/state` une première fois. Résultat `{ enrolled: true, entitlement, synced_at? }`. Répond aussi en [mode restreint](#mode-restreint), et c'est la commande qui en sort |
| `keys.list` | — : les clés du bloc balisé, `{ keys[]: { fingerprint, comment?, device_id?, signer? }, synced_at? }`. `signer` dit que l'agent tient cette clé pour sûre et accepte ce qu'elle signe. `device_id` est réservé : aucun agent ne l'émet encore |
| `keys.sync` | — : force une lecture de `/api/v1/agent/state`, et rend la même liste avec `pending[]`, les empreintes des clés que la plateforme demande et qu'aucune approbation valide ne couvre encore |
| `keys.trust` | `{ public_key }` : une clé nue, `type base64`, Ed25519 ou ECDSA NIST, sans option ni commentaire. Elle devient signataire et entre tout de suite dans le bloc. C'est le geste de l'app, sur sa propre session SSH, juste après l'enrôlement : la racine de confiance est posée par SSH, jamais par la plateforme. Rend la liste de `keys.list`. Voir [les clés approuvées](#une-clé-nentre-que-sur-une-approbation) |
| `platform.sync` | — : la même lecture, suivie du heartbeat. `{ synced_at, heartbeat_at? }`. L'app la demande à la fin d'une installation et d'un durcissement, pour que la console montre les modules au lieu d'un serveur vide pendant cinq minutes. Elle lit et rapporte, ne touche à rien de la machine, et reste donc ouverte en mode restreint : un serveur dont la plateforme n'a pas confirmé le droit d'usage est exactement celui qui doit redemander. Un `heartbeat_at` absent dit que l'état a été lu et que le battement n'est pas passé ; le daemon le refera |
| `agent.upgrade` | `{ version?, signature?, allow_downgrade? }` : télécharge, vérifie, remplace, redémarre. `busy` pendant une autre mise à jour, une installation, une sauvegarde ou une restauration. Un nouveau binaire qui ne répond pas à `hello` — posé dans le protocole qu'il dit parler par `pupitred version --json`, si bien qu'une mise à jour vers une génération suivante n'est pas prise pour une panne — est remplacé par l'ancien, et la configuration qu'il a migrée est remise à la révision d'avant ([migrations de configuration](./config-migrations.md#lordre-dune-mise-à-jour)) |
| `agent.migrate` | — : porte la configuration de la machine à la forme que ce binaire lit, et rend `{ revision, expected, state, applied[], pending[], backup?, failure?, restored }`. Elle répond toujours, même quand une migration a refusé : ce sont les autres commandes qui refusent alors. Voir [migrations de configuration](./config-migrations.md) |
| `reboot` | — |
| `doctor` | — : diagnostic court |
| `diag` | — : rapport complet à coller dans un ticket |

## Le flux secret

Une commande qui porte un secret (`install`, `enroll`, `harden.sudo`) annonce `secrets_stdin: true`. L'app écrit alors **la ligne suivante de l'entrée standard** avec les secrets en JSON, immédiatement après la requête ; l'agent la consomme avant d'appeler le handler, sans la journaliser ni la renvoyer. Aucun secret n'apparaît dans `params`, dans un événement ou dans un rapport.

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

Pour `harden.sudo`, la ligne porte l'empreinte `crypt` du mot de passe de `dev`, jamais le mot de passe (schéma `HardenSudoSecrets`, motif `SUDO_PASSWORD_HASH_PATTERN`) :

```jsonc
{ "password_hash": "$6$rounds=100000$…$…" }
```

## Le mot de passe sudo

`harden.sudo` est le seul chemin vers la règle sudo de la [décision 0015](../decisions/0015-sudo-par-mot-de-passe.md). Aucune migration ne la pose : l'agent ne peut pas inventer un mot de passe que le client ne connaîtrait pas, si bien qu'un serveur installé avant elle garde `dev ALL=(ALL) NOPASSWD:ALL` jusqu'à ce que l'app appelle la commande. `core.system` pose cette règle d'avant sur un serveur neuf et ne réécrit jamais la nouvelle.

**Ce que l'app fait.** Elle tire le mot de passe sur l'ordinateur — six groupes de quatre caractères sans ceux qu'on confond —, en calcule l'empreinte SHA-512 `crypt` (`$6$rounds=100000$…`), la seule chose qui part, et garde le mot de passe au trousseau. Elle appelle la commande juste après `harden`, sur la session rouverte en `dev`.

**Ce que l'agent fait, dans cet ordre**, chaque étape un événement `step` :

1. `check-sshd-passwords` — `sshd -T -C user=dev` doit rendre `passwordauthentication no`, et `no` pour `kbdinteractiveauthentication` et `challengeresponseauthentication` quand elles paraissent : un mot de passe sur un SSH qui en prend serait une porte depuis n'importe où. Sinon `bad_request`, rien n'est touché.
2. `check-agent-binary` — `/usr/local/bin/pupitred` et chacun des dossiers au-dessus appartiennent à root, ne sont pas des liens, et ni le groupe ni les autres ne les écrivent. Sinon `internal`, rien n'est touché : la règle nommerait un binaire que `dev` pourrait remplacer.
3. `set-password` — `chpasswd -e` reçoit `dev:<empreinte>` sur son entrée standard. Sauté quand `/etc/shadow` tient déjà cette empreinte.
4. `restrict-sudo` — la règle est écrite dans `/etc/sudoers.d/.90-dev.pupitre`, un nom que sudo ne lit pas, vérifiée par `visudo -c -f`, puis écrite atomiquement dans `/etc/sudoers.d/90-dev`, 0440 root. Sautée quand le fichier la tient déjà.

```
dev ALL=(ALL:ALL) ALL
dev ALL=(root) NOPASSWD: /usr/local/bin/pupitred serve, /usr/local/bin/pupitred binary install
```

sudo retient la dernière règle qui s'applique : celle de `pupitred` vient donc après celle qui demande le mot de passe. Une commande que sudoers écrit avec des arguments ne correspond qu'à ces arguments, exactement ; un joker y correspondrait aussi à une espace, donc à tout argument ajouté. La règle nomme deux lignes exactes et aucun joker : `sudo -n pupitred serve` et `sudo -n pupitred binary install` passent, `pupitred serve --privileged`, `pupitred serve ""`, `pupitred binary install --privileged` et toute autre sous-commande — `keys reset`, `migrate`, `install`, `dev`, `version` — tombent sur la première règle et demandent le mot de passe. `SETENV` n'est pas accordé : `sudo PUPITRE_…=… pupitred serve` et `sudo -E` sont refusés. Le mot de passe passe avant la règle : une règle qui demanderait un mot de passe que `dev` n'a pas enfermerait le client dehors. Un échec de `restrict-sudo` laisse donc `dev` avec le nouveau mot de passe et l'ancienne règle ; l'app garde le mot de passe dès que `set-password` n'a pas échoué.

Rejouée, la commande ne change rien d'autre que le mot de passe qu'on lui donne : c'est ainsi qu'un mot de passe perdu se remplace depuis l'app. L'empreinte ne va ni dans `params`, ni au journal, ni dans un message d'erreur, où le refus d'une ligne mal formée ne cite que le motif attendu.

**Poser un binaire d'agent en `dev`.** `sudo` n'ouvrant plus de shell à `dev`, l'app pousse le binaire dans un fichier de `dev` et le confie à `sudo -n pupitred binary install`, sur l'entrée standard, derrière une première ligne qui porte ce que la signature couvre : `{"version":"<v>","signature":"<b64>"}`. Ni la version ni la signature ne sont des arguments : la ligne que sudo laisse passer sans mot de passe reste exacte. `pupitred` vérifie la signature avec la clé qu'il porte, sur la version, son architecture et l'empreinte des octets reçus ([ce que la signature couvre](#ce-que-la-signature-dune-mise-à-jour-couvre)), refuse une version sous la sienne, puis se remplace comme `agent.upgrade` le fait, retour en arrière compris, et écrit `<empreinte>  <chemin>` sur sa sortie. Une ligne illisible, sans version ou avec un champ inconnu est refusée, code 1, avant tout remplacement. Tout drapeau fait une autre ligne de commande, que sudo n'ouvre que sur le mot de passe : `--allow-downgrade` lève le plancher, `--privileged` seul dit que le mot de passe a été donné. Un agent construit sans clé — un build du dépôt, l'agent de développement — n'a rien pour vérifier les octets : il refuse `binary install` en `privilege_required`, et ne pose le binaire que par `binary install --privileged`. L'app y fait passer un agent non signé avec le mot de passe sur la première ligne, lu par `sudo -S` — ou par le shell sous la règle d'avant, où sudo n'en demande pas. Un agent antérieur à la sous-commande répond par son usage, code 2 ; sur un tel serveur `dev` tient encore `NOPASSWD:ALL`, et l'app retombe sur l'installation par `sh -c`, sur les octets qui suivent la première ligne. La toute première installation, sur un serveur nu joint en root, n'a pas de `pupitred` pour vérifier quoi que ce soit : l'app y écrit le binaire qu'elle a vérifié elle-même.

## Deux sessions : sans mot de passe et privilégiée

`pupitred serve` est la ligne que sudo lance pour `dev` sans mot de passe : tout ce qui tourne en `dev` — un agent IA, un `postinstall`, un terminal — peut l'ouvrir. C'est la **session limitée**. `pupitred serve --privileged` est une autre ligne, que sudo ne lance que sur le mot de passe de `dev` : la **session privilégiée**. L'argument est ce que sudo a comparé ; aucun autre drapeau n'est admis, `pupitred serve` refuse tout argument inconnu par son usage, code 2. En root — l'onboarding avant la sécurisation —, l'app lance `pupitred serve --privileged` directement.

La session limitée répond aux commandes de `LIMITED_COMMANDS` (`packages/shared`, exporté sous `LimitedCommands`), et refuse les autres par `privilege_required`, avec le `fix` qui nomme la session privilégiée, avant toute autre vérification et après avoir consommé une éventuelle ligne de secrets. C'est une liste blanche : une commande ajoutée au contrat est privilégiée tant qu'on ne l'y déclare pas. Chaque commande de la liste est au pire une gêne entre les mains de `dev` :

| Session limitée | Pourquoi |
| --- | --- |
| `hello`, `ping`, `probe`, `catalog`, `report`, `snapshot`, `status`, `service.status`, `module.config`, `completions`, `doctor`, `diag`, `backup.status`, `backup.contents`, `keys.list`, `tunnel.status`, `db.url`, `db.shell` | des lectures qui ne rendent aucun secret que root tient : `module.config` tait les champs secrets, `service.status` ne nomme que des variables, `db.url` et `db.shell` rendent une adresse sans mot de passe et une ligne à taper |
| `project.*`, `agent.open`, `sessions.*`, `processes.list`, `process.kill`, `shots.*`, `fs.*`, `secrets.sync` | le travail de `dev` sur ce qui est à `dev` : les processus tournent en `dev`, `fs.*` ne voit que son dossier par `os.Root`, `process.kill` ne vise qu'un processus de `dev`, les gabarits se lisent dans la racine du projet, le jeton 1Password est aussi dans l'environnement de `dev` |
| `service.start`, `service.stop`, `service.restart`, `service.logs`, `tunnel.sync`, `tunnel.restart` | une unité déjà configurée, arrêtée ou relancée ; le tunnel ne publie que les routes du registre, sous le domaine du serveur |
| `platform.sync`, `keys.sync` | ce que le daemon fait toutes les 30 secondes : une clé n'entre que sur une approbation signée |
| `agent.upgrade`, `agent.migrate` | un binaire signé Ed25519 au-dessus du plancher, une migration vers l'avant — sans `allow_downgrade`, qui rend la commande privilégiée |

| Session privilégiée seulement | Pourquoi |
| --- | --- |
| `install`, `install.check`, `upgrade`, `uninstall` | une configuration fournie par l'appelant devient des fichiers root et des commandes root ; `install.check` la fait peser par des préflights qui tiennent les secrets de la machine |
| `harden`, `harden.sudo` | SSH, root et le mot de passe sudo de `dev` lui-même |
| `service.secret`, `db.dump`, `db.import` | un secret de `/etc/pupitre/env`, une base entière, un dump de `~/dumps` joué par le superutilisateur du moteur |
| `backup.run`, `backup.delete`, `backup.inspect`, `backup.restore.*` | une sauvegarde de plus élague les anciennes, une suppression les perd, une restauration réécrit la configuration |
| `keys.trust`, `enroll` | à qui le serveur fait confiance, et à quelle plateforme il répond |
| `reboot`, `agent.upgrade { allow_downgrade: true }` | la machine arrêtée ; un binaire signé mais connu faillible |
| `access.*`, `project.add` ou `project.update` qui portent `protected: false` sur le projet ou sur un processus | qui peut ouvrir une adresse publiée, et une adresse ouverte au web sans clé : un agent IA en `dev` ne lève pas la protection de lui-même |

**Ce que l'app fait.** Elle ouvre les quatre canaux de la session limitée comme avant, par `sudo -n pupitred serve`, et un cinquième, privilégié, à la demande, pour chaque commande que `requiresPrivilege` (`packages/shared`) désigne. Pour `dev`, ce canal lance :

```sh
if sudo -n true 2>/dev/null; then IFS= read -r p; exec sudo -n pupitred serve --privileged; fi
exec sudo -S -p 'pupitre-sudo:' pupitred serve --privileged
```

et écrit sur la première ligne de l'entrée standard le mot de passe gardé au trousseau — une ligne vide quand l'ordinateur n'en tient pas —, puis le protocole. `sudo -S` lit cette ligne octet par octet et laisse le reste à `pupitred`. Sous la règle d'avant, sudo ne demande rien et la ligne irait à `pupitred` comme une requête : le shell la lit d'abord. Le mot de passe n'est jamais un argument, une variable d'environnement ni une ligne de journal. `pupitre-sudo:` est le prompt que sudo écrit avant chaque lecture : un second sur la sortie d'erreur est le mot de passe refusé — et `hello` lu comme la tentative suivante —, l'app coupe le canal et le dit (`privilege_required`, « refusé » ou « absent de cet ordinateur ») sans le retenter avec le même mot de passe. Le canal privilégié se referme après une minute sans usage.

**Sur la machine.** `pupitred dev` parle de même à `sudo -n pupitred serve` quand le compte qui le tape ne lit pas le rattachement ; un verbe privilégié — `dev db dump`, `dev db import`, `dev backup now` — ouvre `sudo pupitred serve --privileged`, dont sudo demande le mot de passe sur le terminal, et refuse sans terminal.

## Un service se pilote sur son unité

`service.status` rend l'unité systemd que le module déclare dans `unit`, et c'est à elle que `service.start`, `service.stop` et `service.restart` s'adressent. Un service `failed` a ainsi un remède sur sa page, sans réinstaller quoi que ce soit : le module n'est pas rejoué, seule son unité bouge.

**La réponse est l'état, pas l'intention.** L'agent attend que systemd ait rendu son verdict — `systemctl start` tient la commande jusqu'à ce que l'unité soit partie ou ait échoué, trois minutes au plus — puis relit le service et répond ce que `service.status` aurait répondu — `running`, `stopped`, `failed` — sans la table `credentials`, qui reste à `service.status` seul. Un `start` dont l'unité retombe ne répond donc jamais `running`. Quand systemd refuse l'action elle-même, l'erreur est `internal`, porte ce que systemd a dit, et son `fix` renvoie vers `service.logs`.

**Ce qui est refusé, avant de toucher à systemd.** Un `id` qui n'est pas un module installé renvoie `service_not_found`, comme `service.status`. Un module installé sans unité — `core.*`, un outil qui ne tient aucun processus — renvoie `bad_request` : il n'y a rien à démarrer, rien à arrêter, rien à lire.

**Le verrou de run.** Les trois commandes le prennent, exactement comme `tunnel.restart` : pendant une installation, elles répondent `busy` plutôt que de bouger une unité que l'installation est en train d'écrire. `service.logs` ne le prend pas — une lecture répond toujours — et refuse les mêmes `id` que les trois autres.

**Le journal.** `service.logs { id, lines?, follow? }` lit `journalctl -u <unit> -n <lines> --no-pager -o cat`, cent vingt lignes par défaut comme `project.logs`, et répond `{ lines[] }`. Avec `follow`, chaque ligne voyage sur un événement `log { line }`, la queue comprise, `journalctl -f` tient la ligne, et la réponse `{ lines: [] }` ferme le flux au bout du même quart d'heure que le suivi d'un projet. Comme toute commande longue, un suivi bloque le canal sur lequel il passe, et il le tient tant que le lecteur reste : l'app l'ouvre sur son canal des suivis, comme `project.logs`, pour que l'`install` qui applique le formulaire affiché à côté du journal ne l'attende pas.

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

## Le portier d'accès

Chaque nom publié passe par `pupitre-gate` (décision [0017](../decisions/0017-portier-d-acces.md)). L'exposition qui tient la machine, tunnel ou Caddy, l'installe à son `Configure` et le recharge à chaque `tunnel.sync`. Un `tunnel.sync` lancé avant la mise à jour du module installe aussi le portier : l'ingress ne pointe jamais vers un portier absent. Désinstaller l'exposition arrête le portier et garde les clés.

**La protection**
- Le registre porte `protected` sur chaque projet, et `protected` sur un processus qui s'en écarte. `Project.protected` et `ProjectProcess.protected` le rendent.
- Un agent sans portier ne les rend pas, et l'app ne lui envoie rien de la protection.
- La migration 7 protège chaque projet qui ne disait rien.

**Les fichiers**
- `/etc/pupitre/gate/access.json` (0600) : le secret du cookie, tiré une fois, et les clés, `{ id, name, hash, projects, created_at }`.
- `/etc/pupitre/gate/routes.json` (0600) : chaque nom, son amont `host:port`, son projet et sa protection.
- Le portier les relit sur `SIGHUP`, et `access.*` et `tunnel.sync` le lui envoient par `systemctl reload`.

**Une requête sur un nom protégé**

| Ce que porte la requête | Réponse |
| --- | --- |
| `Pupitre-Key: <clé>` qui ouvre le projet | transmise, sans l'en-tête |
| `?pupitre_key=<clé>` sur une navigation (`GET`/`HEAD`, `Sec-Fetch-Mode: navigate` ou `Accept: text/html`) | `303` vers la même adresse sans ce seul paramètre, chemin et autres paramètres gardés dans leur ordre et leur encodage, et le cookie `__Host-pupitre` (400 jours, renouvelé à chaque navigation) |
| `?pupitre_key=<clé>` ailleurs (API, WebSocket, EventSource) | transmise sur place, sans le paramètre |
| cookie `__Host-pupitre` d'une clé qui existe encore | transmise, sans le cookie ; les autres cookies restent tels quels |
| rien, ou une clé refusée, sur une navigation | `401`, page de connexion à l'adresse demandée, dans la langue du visiteur ; son formulaire poste sur `/.pupitre/login` avec `next`, un chemin du même site seulement |
| rien, ou une clé refusée, ailleurs | `401` `{ error: { code: "access_required", message, fix } }` |
| un pré-vol CORS (`OPTIONS` avec `Access-Control-Request-Method`) | transmis sans clé |

**Ce que le site reçoit**
- Un en-tête `Pupitre-Identity` entrant est toujours retiré. Le site reçoit le nom de la clé, encodé, dans `Pupitre-Identity`, `X-Forwarded-Host` et son propre `Host`.
- Plus de vingt clés refusées en dix minutes depuis une même adresse répondent `429` (`access_throttled`).

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

**Une capture est rangée sous son projet.** La galerie tient `~/shots/<projet>/<jour>/<nom>`, et `~/shots/_unfiled/<jour>/<nom>` pour ce qui n'a pas de projet — aucun nom de projet ne commence par `_`. Chaque `Shot` porte `project` : le nom du projet, `null` hors projet ; un agent antérieur au champ ne le rend pas. `shot` choisit le projet dans cet ordre : celui que `--project` nomme (refusé s'il n'est pas déclaré), celui dont le dossier contient le dossier courant, celui dont un processus sert l'URL capturée — par son nom public ou par son hôte et son port —, sinon aucun. Les projets sont à root : `shot`, lancé par `dev`, les demande à `sudo -n pupitred serve` par `project.list`, comme les verbes de `dev`. Les captures d'avant, rangées par jour à la racine, passent sous `_unfiled` à la prochaine capture et au prochain `Configure` d'`ai.browser`.

**La galerie ne se publie que si le propriétaire le demande.** L'app continue de montrer une capture par `shots.read`, pour les raisons ci-dessus. Mais une capture qu'un agent doit montrer à un humain hors de l'app — Claude sur le web, un lien collé dans une revue — a besoin d'une adresse. Le champ `subdomain` d'`ai.browser` la donne : l'agent tire un jeton de 128 bits, écrit `/etc/pupitre/shots.env` (0600, lu par systemd comme `EnvironmentFile` de `pupitre-shots` avant de passer à `dev`, jamais sur une ligne de commande), et l'exposition installée — Cloudflare Tunnel ou Caddy, qui s'excluent — sert `https://<sous-domaine>.<domaine>` vers `127.0.0.1:8099`. La galerie ne répond alors que sous `/<jeton>/` : tout autre chemin est un 404, la liste comprise, et chaque réponse dit `X-Robots-Tag: noindex` et `Referrer-Policy: no-referrer`. Rien de plus n'écoute : la route passe par la connexion sortante du tunnel ou par le Caddy que le client a choisi. Un domaine déplacé emmène le nom avec lui, jeton gardé ; changer de sous-domaine garde le jeton ; vider le champ retire la route et oublie le jeton, si bien que le remettre en tire un nouveau et coupe toutes les adresses données avant.

`shots.url` rend `{ url, exposed }`. `exposed` est vrai quand le nom est publié sous le domaine du serveur et qu'une exposition le sert : `url` est alors `https://<sous-domaine>.<domaine>/<jeton>`, ce que `shot` préfixe à chaque capture. Sinon `url` est `http://127.0.0.1:8099`, qui ne s'ouvre que sur le serveur, et `shot` le dit sur la sortie d'erreur.

**Une capture se supprime seule.** `shots.clean` sans paramètre fait le ménage de la galerie — ce qui a dépassé sa durée de garde s'en va — et répond `{ removed }`, le nombre de captures parties. `shots.clean { path }` supprime cette seule capture, et répond `{ removed: 1 }`. Le `path` passe par la même porte que `shots.read` : il est cherché dans le listing de `shots.list`, jamais résolu sur le disque. Un chemin absolu, un `..`, une entrée que la galerie ne nomme pas — ou ne nomme plus, parce qu'elle vient d'être supprimée — renvoient `bad_request` avec le remède qui dit de reprendre un `path` du listing.

## Fichiers

Les sept commandes `fs.*` ouvrent l'arbre de travail du client : lister un dossier, décrire une entrée, lire un fichier, en écrire un, créer un dossier, déplacer une entrée, en supprimer une.

**Une seule racine, et rien au-dessus.** Tout chemin est relatif au dossier de travail du serveur — le foyer du compte des projets — et cette racine ne figure pas dans le contrat, exactement comme la racine des projets n'y figure pas : c'est un détail du serveur, et l'app n'a donc rien à concaténer. La chaîne vide nomme la racine elle-même, et c'est le seul chemin que `fs.list` accepte vide. Un chemin absolu, un `..`, un lien symbolique dont la cible sort de la racine renvoient `bad_request` avec le remède qui dit comment nommer un chemin. L'agent ne juge pas ces chemins à la main : il ouvre la racine une fois et n'agit qu'à travers elle, si bien qu'un lien planté dans l'arbre ne peut pas devenir une lecture de `/etc/shadow`. Un lien qui reste dedans, lui, est une entrée comme une autre : `kind` dit `link`, et sa taille et sa date sont celles de ce qu'il désigne. Un tube nommé, une socket ou un périphérique est `special` : listé et décrit, jamais lu ni haché — une lecture y attendrait sans fin —, et l'app n'offre dessus que le renommage et la suppression. Une app d'avant ce genre le lit comme un fichier et la lecture est refusée en `bad_request`.

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

## Une clé n'entre que sur une approbation

La plateforme transmet les clés publiques des appareils ; elle ne peut plus ouvrir un serveur ([décision 0014](../decisions/0014-cles-approuvees-par-un-appareil.md)). L'agent tient une liste de **signataires** dans `/etc/pupitre/signers.json`, root, 0600, et n'écrit dans le bloc balisé d'`authorized_keys` qu'une clé signataire, ou une clé qui arrive avec une approbation signée par un signataire.

**Qui devient signataire.** Une clé posée par `keys.trust` sur la session SSH de l'app, une clé acceptée par une approbation valide, la clé de `sudo pupitred keys reset`, et, une seule fois, les clés que le bloc tenait quand la migration 6 (`key-signers`) a tourné : un serveur déjà en service garde ses appareils sans que personne n'ait à les réapprouver.

**Ce que `/agent/state` porte.** `keys[]`, une entrée par clé que la plateforme veut sur ce serveur : `{ public_key, user_id, device_id, approvals[] }`. `authorized_keys`, la liste nue d'avant, reste servie aux agents plus anciens ; un agent de cette version l'ignore. Une réponse sans `keys` laisse le bloc et les signataires tels qu'ils sont.

**Une approbation** est `{ server_id, public_key, user_id, issued_at, signer, signature }` (`KeyApproval` dans `packages/shared/src/keys`). `signature` est une signature SSHSIG armurée, faite par `ssh-keygen -Y sign -n pupitre-key-approval` avec la clé privée d'un appareil, qui ne quitte jamais son ordinateur, sur ces octets exacts, cinq lignes terminées chacune par un seul `\n`, ASCII :

```
pupitre-key-approval-v1
server_id:<server_id>
public_key:<type> <base64>
user_id:<user_id>
issued_at:<AAAA-MM-JJTHH:MM:SSZ>
```

Rien n'est retaillé ni réordonné d'un côté ou de l'autre. La clé est `type base64` sans commentaire ; la date est UTC, à la seconde. Les deux côtés sont tenus au même jeu d'essai, fait par un vrai `ssh-keygen` (`packages/shared/src/keys/fixtures.json`, exporté en `key-approval.fixtures.json` pour l'agent).

**Ce que l'agent vérifie** avant d'accepter une clé : les champs tiennent leurs motifs ; `server_id` est l'identifiant que ce serveur a déjà noté, jamais celui que la réponse du moment annonce ; `public_key` et `user_id` sont ceux de l'entrée ; la clé est Ed25519 ou ECDSA NIST, sans option, sans caractère de contrôle ; `issued_at` a moins de sept jours et pas plus de cinq minutes d'avance ; `signer` est l'empreinte d'un signataire et la clé portée par l'enveloppe est la sienne ; l'espace de noms est `pupitre-key-approval`, le hachage `sha512` ou `sha256` ; la signature vérifie ; et la date est postérieure au dernier retrait de cette clé, pour qu'une approbation rejouée ne ramène pas un appareil qu'on a retiré. Sinon l'entrée est ignorée et comptée **en attente**. Une clé acceptée devient signataire à son tour.

**Retirer ne demande rien.** Un signataire que la plateforme ne demande plus quitte le bloc et la liste, et son retrait est noté. Mais l'agent **ne retire jamais la dernière clé** : quand il ne resterait rien, le bloc et les signataires restent tels qu'ils sont. Une révocation du jeton de serveur suspend le droit d'usage et ne touche plus aux clés, pour la même raison.

**Le heartbeat** porte `keys: { signers[], pending[] }`, des empreintes seulement — la plateforme a déjà les clés publiques. Un changement de l'ensemble en attente fait battre le daemon tout de suite, pour que l'app d'un appareil signataire propose l'approbation sans attendre cinq minutes.

**Le secours** est sur la machine : depuis la console de l'hébergeur, `sudo pupitred keys reset --key <clé publique ou fichier .pub>` remplace le bloc et les signataires par cette clé seule. L'onboarding de l'app la reprend ensuite, et repose sa propre clé d'appareil par `keys.trust`.

## Le plancher de version

Une signature ne périme jamais : le binaire vulnérable d'hier reste signé demain. Sans garde-fou, qui tient le canal peut donc réinstaller une version ancienne et connue faillible. L'agent refuse de descendre.

**Le plancher est la plus haute de deux versions** : celle que l'agent exécute au moment de la demande, et `minimum_version` que `/api/v1/agent/state` annonce pour ce serveur. Une version strictement inférieure au plancher est refusée avec `downgrade_refused`, avant tout téléchargement.

La version courante est le plancher qui compte, parce que l'agent la connaît sans rien demander : elle tient quand la plateforme est injoignable, c'est-à-dire précisément quand un canal hostile a le plus de latitude. `minimum_version` est la mémoire de la plateforme — la dernière version qu'elle a vue tourner sur ce serveur — et sert le cas où le binaire a été remplacé sans l'accord de l'agent : celui qui redémarre en 0.9.0 se voit rappeler qu'on l'a connu en 1.4.0. Quand la plateforme ne répond pas, le plancher se réduit à la version courante, et la mise à jour vers l'avant reste possible : un agent périmé doit rester réparable.

`allow_downgrade: true` lève le plancher, et rien d'autre : la signature, l'empreinte, la version et l'architecture sont vérifiées comme toujours. C'est un geste explicite du propriétaire, que l'app ne compose pas seule ; le refus qui le précède porte le `fix` qui le nomme. La session limitée le refuse par `privilege_required` : un binaire signé mais connu faillible, choisi par qui tient `dev`, serait du code root de son choix.

## Versionnage

`protocol` est un entier. Un champ ajouté à un résultat ne l'incrémente pas ; un champ retiré ou renommé, oui. Il ne dit rien de la forme des fichiers posés sur la machine, qui a son propre compteur — voir [migrations de configuration](./config-migrations.md). Un `hello` dont le `protocol` n'est pas celui de l'agent est refusé par `protocol_mismatch`.

**Les paramètres sont fermés, les résultats sont ouverts.** L'agent refuse en `bad_request` une clé de `params` que son schéma ne connaît pas, si bien qu'un champ ajouté à une commande n'est lisible que par les agents qui le connaissent, alors qu'un champ ajouté à un résultat est ignoré par les apps qui ne le connaissent pas. Un champ de paramètre nouveau est donc toujours optionnel, et **l'app l'omet tant qu'il vaut son défaut** : `defer` absent plutôt que `[]`, `boot` absent plutôt que `false`, `runtimes` absent plutôt que `{}`. C'est ce qui permet à une app d'une génération de parler à tous les agents de cette génération sans que la feuille de compatibilité ne bouge ; un champ qu'on ne peut pas omettre à son défaut est une génération nouvelle.

La **feuille de compatibilité** dit lequel des deux mettre à jour. Elle vit dans `packages/shared/src/compat`, une ligne par génération — le protocole, la première version d'app et la première version d'agent de la génération — et voyage jusqu'à l'agent dans `schema.json`. Une génération commence là où l'un ne peut plus piloter l'autre : un protocole nouveau, ou un geste qui change de chemin sur le même protocole — la 1.0, dont l'agent garde les commandes privilégiées pour la [session privilégiée](#deux-sessions--sans-mot-de-passe-et-privilégiée) qu'une app 0.x n'ouvre pas. Une pré-version appartient à la lignée qu'elle annonce : `0.2.0-beta.1` est de la génération de `0.2.0`.

Le refus de `hello` s'écrit avec elle : un agent d'une génération antérieure répond que c'est lui qu'il faut mettre à jour, et nomme la version minimale ; une app d'une génération antérieure s'entend dire l'inverse, par `protocol_mismatch`, même quand elle parle le même protocole. Une version qui n'est pas du semver — un build de développement — n'est jugée par personne, et le message retombe sur les deux numéros de protocole.

`agent.upgrade` vérifie le nouveau binaire par un `hello` où `app_version` est la version installée : un successeur dont le plancher d'app dépasse la version courante n'est pas pris pour une panne. Les agents antérieurs à la 1.0 envoient leur propre version, que l'agent 1.0 refuse : ils reviennent en arrière, avec ce refus pour message.

Côté app, le bandeau de mise à jour lit la même feuille : pour un agent d'une génération en arrière, `agent.upgrade` échouerait — il ne répond plus au protocole, ou son successeur refuserait sa vérification —, et l'écran renvoie vers la réinstallation de l'agent, qui pousse le binaire puis lance `agent.migrate`.

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
