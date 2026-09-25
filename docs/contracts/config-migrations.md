# Migrations de configuration

Une mise à jour ne réinstalle rien. Le binaire de l'agent est remplacé, l'app se met à jour toute seule, et les fichiers que l'un et l'autre lisent restent là où ils sont. Quand une version change la **forme** d'un de ces fichiers — un champ renommé, un module scindé en deux, une valeur qui ne veut plus dire ce qu'elle voulait dire — le nouveau code lit l'ancienne forme et se trompe. Ce document dit comment on ferme cet écart, des deux côtés, et ce que ça coûte d'ajouter un changement de forme.

**La règle, en une phrase : un binaire ne lit jamais une configuration qu'il n'a pas migrée.**

## Ce que le registre possède

| Côté | Fichiers | Registre | Sauvegardes |
| --- | --- | --- | --- |
| Agent, sur le VPS | `/etc/pupitre/install.json`, `/etc/pupitre/env`, `/etc/pupitre/projects.local.json`, et tout autre fichier de `/etc/pupitre` qu'une migration nomme | `/etc/pupitre/migrations.json` | `/var/lib/pupitre/config-backups/<horodatage>-r<révision>/`, les cinq derniers lots |
| App, sur le laptop | `servers.json`, `account.json`, `transfers.json` dans le dossier de données | le champ `version` du fichier lui-même | `<fichier>.r<révision>`, à côté |

Ce que le registre **ne** possède pas :

- **Les fichiers qu'un module écrit** — la configuration de Caddy, une unité systemd, un fichier de service. Ils appartiennent au module, et c'est son `Upgrade` qui les porte à la forme d'aujourd'hui. Le registre ne s'en mêle pas : un module réécrit les siens depuis ses valeurs à chaque montée de version, alors que le registre, lui, porte les valeurs.
- **La règle sudo de `dev`** (`/etc/sudoers.d/90-dev`, [décision 0015](../decisions/0015-sudo-par-mot-de-passe.md)). Elle appartient à `core.system`, qui pose l'ancienne sur un serveur neuf et ne réécrit jamais la nouvelle ; et aucune migration ne passe de l'une à l'autre, parce que la nouvelle exige un mot de passe que seul le client peut accepter. C'est `harden.sudo`, appelé par l'app, qui la pose. Voir [le mot de passe sudo](./agent-protocol.md#le-mot-de-passe-sudo).
- **La base de la plateforme.** D1 a ses migrations SQL (`packages/db/migrations`), qui n'ont rien à voir avec celles-ci et ne se croisent jamais.
- **Le code du client.** Les projets, les dépôts, les données des bases installées ne sont pas de la configuration Pupitre.

## La révision est un compteur, pas une version

Un entier qui ne fait que monter, tenu par l'agent, indépendant de `X.Y.Z`.

Les formes ne changent pas une fois par release, et une pré-version ou un build de développement n'a pas sa place dans un ordre qui doit être exact. Comparer des numéros de version pour décider si une migration est due, c'est se donner `0.4.0-beta.2` à trancher un jour de panne. Un compteur ne se discute pas.

La version de l'agent est **écrite à côté** de chaque entrée du registre, pour qui relit une machine dans deux ans. Rien n'en dépend.

## Ce que dit la machine

`hello` porte un champ `config`, facultatif :

```jsonc
{ "id": 1, "ok": true, "result": {
  "agent_version": "0.4.0",
  "protocol": 1,
  "entitlement": "valid",
  "capabilities": ["…"],
  "config": { "revision": 3, "expected": 4, "state": "pending" }
} }
```

| `state` | Ce que c'est |
| --- | --- |
| `current` | la configuration est la forme que ce binaire lit |
| `pending` | elle est en retard : les migrations n'ont pas encore tourné, parce qu'une installation tenait le verrou |
| `failed` | une migration a refusé ; la configuration a été **remise en l'état** et rien n'est resté à moitié changé |
| `ahead` | elle est en avance : cette machine a été configurée par un agent plus récent que celui qui tourne |

Un agent antérieur au registre ne rend pas le champ, et l'app tient sa configuration pour courante — ce qu'elle est, puisque rien n'avait encore changé de forme.

## `agent.migrate`

| Commande | Paramètres | Résultat |
| --- | --- | --- |
| `agent.migrate` | — | `{ revision, expected, state, applied[], pending[], backup?, failure?, restored }` |

- `applied[]` est ce que **cet appel** a fait : `{ id, slug, ms }`, dans l'ordre. Vide quand l'agent avait déjà migré tout seul au démarrage, ce qui est le cas normal.
- `pending[]` sont les identifiants encore dus, quand l'état n'est pas `current`.
- `backup` nomme le dossier qui garde les fichiers d'avant le lot. Il est nommé même en cas de succès : c'est là qu'on va pour revenir en arrière.
- `failure` nomme la migration qui a refusé, et `restored` dit si les fichiers d'avant ont pu être remis.

**`agent.migrate` répond toujours, même quand une migration a refusé.** Ce qui a refusé, ce qui a été gardé et ce qui reste dû sont exactement ce dont le lecteur a besoin ; une enveloppe d'erreur n'en porterait rien. Le refus, lui, appartient à toutes les autres commandes.

La commande est ouverte en [mode restreint](./agent-protocol.md#mode-restreint) : `agent.upgrade` l'est aussi, et un serveur dont le droit d'usage est en attente est exactement celui qu'on va vouloir remettre à jour.

## Ce qu'un serveur en retard laisse ouvert

Une configuration que le binaire ne lit pas n'est pas une configuration à deviner : un module à qui l'on passe des valeurs qu'il comprend de travers les réécrit de travers. Toute commande qui lit ou écrit une configuration est donc refusée en **`migration_required`**, avec le `fix` qui nomme le geste.

Ce qui reste ouvert, c'est la vue de la machine et les portes de sortie : `hello`, `ping`, `snapshot`, `status`, `report`, `diag`, `doctor`, `agent.upgrade`, `agent.migrate`, `enroll`, `platform.sync`. La liste vit dans `packages/shared` sous `MIGRATION_COMMANDS`, voyage dans `schema.json`, et l'agent la lit de là — comme `RESTRICTED_COMMANDS`, et pour la même raison : un serveur qu'on ne peut pas regarder est un serveur qu'on ne peut pas réparer.

## L'ordre d'une mise à jour

C'est l'app qui met l'agent à jour, donc c'est elle qui enchaîne. `runAgentUpgrade` fait, dans cet ordre :

1. **`agent.upgrade`** — le binaire est vérifié, remplacé, l'unité redémarrée. Une seule mise à jour à la fois (`busy` sinon), et jamais pendant une installation, une sauvegarde ou une restauration : le redémarrage la couperait. Si le nouveau binaire ne répond pas à `hello`, l'ancien revient, et avec lui la configuration : le lot que le nouveau binaire a sauvegardé avant de migrer est remis, révision comprise, avant que l'ancien ne redémarre — sinon il trouverait une configuration `ahead` et refuserait presque tout. C'est la seule restauration que l'agent fait de lui-même : ce lot a quelques secondes, rien n'a été configuré depuis.
2. **Le canal est fermé.** Le `pupitred serve` qui nous répond tient encore le fichier qu'il a ouvert : le remplacement se fait par un `rename`, donc seule une nouvelle session atteint la version qui vient d'être installée. Sans cette fermeture, tout ce qui suit interroge l'ancien binaire.
3. **`agent.migrate`** — sur le canal rouvert. Le nouveau binaire a déjà migré en démarrant ; l'appel confirme et rapporte. `unknown_command` est un agent antérieur au registre : il n'y avait rien à porter.
4. **`upgrade { modules }`** — les modules déjà installés rejouent leurs étapes. Si la migration a échoué, l'agent refuse cette commande lui-même : l'app n'a pas de garde à écrire, elle a une phrase à afficher.

L'agent **migre aussi tout seul**, au démarrage de `serve` et de `daemon`, avant de servir la première commande. C'est ce qui fait qu'une machine mise à jour par un autre chemin — un binaire poussé à la main, une mise à jour venue de la plateforme — converge sans que personne ne lui demande rien. Le chemin rapide ne prend aucun verrou : une machine déjà à la révision répond sur une lecture d'un petit fichier, ce que fait chaque second canal ouvert pendant une installation.

## Ce qu'une migration doit être

Cinq règles. Elles ne se négocient pas ; le reste est du goût.

1. **Idempotente.** Rejouée sur une machine déjà migrée, elle ne change rien. C'est ce qui rend une reprise après coupure sûre.
2. **Sans effet sur un fichier absent.** Une machine qui n'a jamais tenu ce fichier n'a rien à porter, et la migration la laisse tranquille.
3. **Elle lit du JSON brut, jamais un type d'aujourd'hui.** `ctx.JSON()` rend une `map[string]any`, `ctx.Lines()` des lignes. Décoder dans la structure Go du moment ferait tomber, au passage, tout champ que cette structure ne nomme plus — c'est-à-dire précisément ce que la migration existe pour porter.
4. **Son identifiant est fixé pour toujours.** C'est ce que la machine retient. Un numéro qui bouge est une migration qui tourne deux fois ou pas du tout. On n'en supprime pas, on n'en réordonne pas : on en ajoute.
5. **Elle ne touche que ce qu'elle déclare.** `Touches` est ce qui est sauvegardé avant le lot, donc ce qui peut être remis. Un fichier écrit sans être déclaré ne revient pas.

## Le lot est une transaction

Avant la première migration en attente, l'agent copie tous les fichiers déclarés par le lot **et le registre lui-même** dans un dossier de sauvegarde.

Le registre est réécrit **après chaque migration**, pas après le lot : une machine qui perd le courant au milieu revient d'accord avec elle-même et ne rejoue que ce qu'elle doit. Un refus, lui, remet tout le lot — les fichiers et le registre, qui sont dans la même sauvegarde — parce qu'un demi-lot est une forme qu'aucun binaire n'a jamais été écrit pour lire.

## Revenir en arrière

Une machine qui doit refaire tourner un agent plus ancien que celui qui l'a configurée est en `ahead` : l'agent refuse de toucher à une configuration qu'il ne lit pas, plutôt que de la deviner. Deux sorties, toutes deux explicites :

```bash
sudo pupitred migrate --status
```

```bash
sudo pupitred migrate --restore=20260911T100000Z-r3
```

`--restore` remet les fichiers du lot et **laisse le registre à la révision qui leur correspond**, si bien qu'un agent récent rejouerait ce que ce lot avait fait. C'est un geste du propriétaire, pas une décision de l'app : ce qui a été configuré depuis part avec. C'est pour cette raison que la restauration n'est pas dans le protocole — l'app ne saurait pas montrer ce qui serait perdu, et le client a de toute façon un terminal sur ce serveur, dans l'app.

## Ajouter une migration

Côté agent — `apps/agent/internal/migrate/migrations.go` :

```go
func All() []Migration {
	return []Migration{
		{
			ID:      1,
			Slug:    "rename-timezone",
			Since:   "0.5.0",
			Touches: []Target{TargetInstall},
			Apply:   renameTimezone,
		},
	}
}
```

Côté app — `apps/desktop/src/main/servers-migrations.ts`, `account-migrations.ts` ou `transfers-migrations.ts` :

```ts
export const SERVERS_MIGRATIONS: readonly StoreMigration[] = [
  { apply: keptTheirOwnPort, id: 4, slug: "port-per-server" },
];
```

Un test par migration : la forme d'avant en entrée, la forme d'après en sortie, et la preuve qu'un second passage ne change rien. Le [skill `config-migrations`](../../.claude/skills/config-migrations/SKILL.md) donne la marche à suivre complète.

## Ce qui reste vrai quand rien ne change

Une machine neuve se voit **estampillée à la révision courante sans que rien ne tourne** — il n'y a pas de forme d'hier à porter, et le registre le dit à qui le lira plus tard.

## Le registre de l'agent

| N° | Slug | Ce qui change |
| --- | --- | --- |
| 1 | `projects-local-json` | `/etc/pupitre/projects.local.conf`, le registre local des projets en colonnes séparées par `\|`, devient `/etc/pupitre/projects.local.json`. Chaque ligne à huit, neuf ou dix colonnes devient un projet ; son sous-domaine devient le `hostname` de son unique route, composé avec le `PUPITRE_DOMAIN` de la machine — sans domaine, la route garde son port et le sous-domaine est écrit au journal. L'ancien fichier est sauvegardé avec le lot, puis supprimé. |
| 2 | `projects-processes` | Un projet tenait une commande, un port et un dossier ; il est un dépôt désormais, et tient des `processes[]`, chacun avec les siens. Chaque entrée de `projects.local.json` devient un projet d'un processus, dont l'`id` est le nom replié en étiquette DNS et le dossier `.`. Les entrées qui partageaient le premier segment de leur `dir` partageaient un dépôt — c'est ce que l'ancien format voulait dire, avec `-` pour le dépôt de toutes les lignes sauf la première — et deviennent **un** projet dont `dir` est ce segment, nommé d'après lui quand aucune ligne d'un autre dépôt ne tient ce nom, un processus par ligne dans son sous-dossier. Dans `/etc/pupitre/env`, chaque entrée `nom:port` de `PUPITRE_DEBUG_PORTS` devient `projet/processus:port`, la fenêtre tmux que le processus occupe. |
| 3 | `projects-boot` | Chaque ligne de `projects.local.json` porte `boot`, vrai quand le projet démarre avec le serveur ; les lignes d'avant ne le demandaient pas et reçoivent `false`. Une ligne qui répond déjà est laissée telle quelle. |
| 4 | `runtime-versions` | Un runtime demandait une version, `node_version: "22"` dans `install.json` ; il en demande plusieurs, `node_versions: ["22"]`. Pour `node`, `java`, `python`, `go`, `php`, `ruby` et `rust`, la valeur d'`<outil>_version` devient la liste d'un élément `<outil>_versions`, sauf si la liste est déjà là ; l'ancienne clé part dans tous les cas. Un module absent d'`install.json` n'est pas touché. |
| 5 | `projects-runtimes` | Chaque ligne de `projects.local.json` porte `runtimes`, la version épinglée par outil ; les lignes d'avant n'en nomment aucune et reçoivent `{}`. Une ligne qui répond déjà est laissée telle quelle. |
| 6 | `key-signers` | Les clés approuvées par un appareil ([décision 0014](../decisions/0014-cles-approuvees-par-un-appareil.md)) : l'agent ne pose plus une clé que si elle est déjà signataire ou qu'une approbation signée l'admet. Chaque clé du bloc géré de `/home/dev/.ssh/authorized_keys` qui peut signer — ed25519 ou ecdsa sur une courbe NIST, sans option — devient signataire dans `/etc/pupitre/signers.json`, `via: "migration"`, pour que la mise à jour n'enferme personne dehors. Une clé RSA ou tenue par des options n'est pas reprise. Un `signers.json` déjà là, un fichier absent, illisible ou lié hors de `.ssh`, un bloc vide : rien n'est écrit. |
