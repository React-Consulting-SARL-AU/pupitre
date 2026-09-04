# Plans d'implémentation

Un plan par chantier. Chaque plan est découpé en lots ; chaque lot en tâches. Une tâche est ce qu'un agent prend en une session : une spec courte, des critères d'acceptation, un périmètre fermé.

## Anatomie d'une tâche

```
### APP-04 — Écran d'inspection
Lot 2 · dépend de AGT-02, INF-04 · workspace apps/desktop

But. Une phrase.
Périmètre. Ce que la tâche livre, fichier par fichier si utile.
Hors périmètre. Ce que la tâche ne fait pas, même si c'est tentant.
Critères d'acceptation.
1. …
2. …
Tests. Où ils vivent, ce qu'ils prouvent.
```

Les identifiants sont stables : on ne renumérote jamais, on ajoute.

## Statuts

| Statut | Sens |
| --- | --- |
| `à faire` | spécifiée, personne dessus |
| `en cours` | un agent y travaille, branche ouverte |
| `en revue` | PR ouverte, lint, typecheck et tests verts, en attente du propriétaire |
| `fait` | fusionnée sur `main` |
| `bloqué` | dépend d'une décision ou d'une tâche non faite ; le blocage est écrit |

L'état vit dans [`../TRACKING.md`](../TRACKING.md), une ligne par tâche. Le plan ne porte pas d'état.

## Démarrer un agent sur une tâche

Un worktree par tâche, une branche nommée `<type>/<ID>-<slug>` :

```bash
git worktree add ../pupitre-APP-04 -b feat/APP-04-inspection
cd ../pupitre-APP-04 && claude
```

Prompt de départ :

```
Lis CLAUDE.md, le CLAUDE.md du workspace concerné, docs/plans/<plan>.md et les contrats listés par la tâche.
Prends la tâche <ID>. Passe-la en « en cours » dans docs/TRACKING.md avec le nom de la branche.
Écris d'abord les tests d'acceptation, puis implémente. Reste dans le périmètre et dans le workspace.
Quand lint, typecheck et tests sont verts, passe la tâche en « en revue » et arrête-toi. Ne commit et ne push que si on te le demande.
```

## Parallélisme

- Deux agents ne travaillent jamais sur le même workspace en même temps, sauf sur des tâches explicitement marquées indépendantes.
- Les contrats (`packages/shared`, `docs/contracts/`) se modifient par une tâche de contrat, jamais depuis une tâche d'implémentation. Une tâche qui découvre un besoin de contrat s'arrête, l'écrit dans `TRACKING.md`, et le propriétaire crée la tâche.
- Le socle `INF` est fini avant que les trois chantiers démarrent.

## Lot INF — Socle

Précède tout. Un seul agent, séquentiel.

### INF-01 — Monorepo Bun + Turbo
Lot 0 · aucune dépendance · racine

But. La racine du dépôt devient un monorepo sur le modèle de React-Box.
Périmètre. `package.json` racine (workspaces `apps/*`, `packages/*`, scripts `dev`, `lint`, `check:types`, `test`, `build`, `db:*`), `turbo.json`, `biome.jsonc` étendant `ultracite/biome/core` avec `semicolons: "asNeeded"`, `tsconfig.base.json`, `tsconfig.worker.json`, `bunfig.toml`, `.husky` (pre-commit : ultracite fix par workspace sur les fichiers indexés ; pre-push : lint, check:types, test affectés), `commitlint.config.js` conventionnel, `.gitignore`, `.env.example` racine, `scripts/assert-package-boundaries.ts` (un app n'importe pas un autre app ; `@pupitre/api/lib/*` interdit hors du package ; entrées Prisma Node interdites dans le code edge).
Hors périmètre. Le contenu des workspaces.
Critères d'acceptation.
1. `bun install` puis `bun run lint`, `bun run check:types`, `bun run test` passent sur un dépôt sans workspace réel.
2. Un commit hors convention est refusé par commitlint.
3. Un fichier `.ts` contenant une chaîne ressemblant à un secret (clé API, jeton, clé privée) est refusé au commit.
Tests. Un test Bun sur `assert-package-boundaries.ts` avec des fixtures.

### INF-02 — Fermeture du dépôt
Lot 0 · aucune dépendance · racine

But. Le dépôt cesse d'être un projet ouvert.
Périmètre. `LICENSE` remplacé par une notice propriétaire (« Tous droits réservés », usage soumis au contrat de licence), suppression des mentions de l'ancienne licence permissive et des invitations à forker dans `README.md`, `app/README.md`, `server/README.md`, `app/package.json`. `README.md` racine réécrit : ce qu'est le dépôt, comment démarrer, renvoi vers `docs/`.
Hors périmètre. Le contrat de licence utilisateur final (rédigé hors dépôt).
Critères d'acceptation.
1. Une recherche insensible à la casse du nom de l'ancienne licence et de l'expression « code ouvert » en anglais, hors `node_modules`, ne renvoie que les fichiers de `docs/decisions/`.
2. Le propriétaire a vérifié que le dépôt distant est privé.

### INF-03 — Workspaces et packages vides
Lot 0 · dépend de INF-01 · racine

But. Chaque workspace existe avec son `package.json`, son `tsconfig.json`, son `CLAUDE.md`, et compile à vide.
Périmètre. `apps/site` (Astro 5 initialisé), `apps/web` (TanStack Start initialisé avec le plugin Cloudflare Vite, `wrangler.jsonc`, `src/worker.ts`), `apps/desktop` (déplacement de `app/` avec historique git, renommage `@pupitre/desktop`), `apps/agent` (module Go `go.mod`, `cmd/pupitred/main.go` qui répond `ping`, `package.json` wrapper avec `build`, `test`, `lint` appelant `go`), `packages/db`, `packages/auth`, `packages/api`, `packages/shared`, `packages/design`, chacun avec ses `exports` et ses scripts `lint`, `check:types`, `test`.
Hors périmètre. Toute fonctionnalité.
Critères d'acceptation.
1. `bun run build` produit le site, le Worker, l'app desktop et le binaire Go.
2. `bun run dev:desktop` lance l'app existante, inchangée fonctionnellement.
3. `apps/agent` compile pour `linux/amd64` et `linux/arm64` avec `-trimpath -ldflags="-s -w"`.

### INF-04 — Contrats initiaux
Lot 0 · dépend de INF-03 · `packages/shared`

But. Les types qui traversent les frontières existent avant les implémentations.
Périmètre. Dans `packages/shared/src/` : `agent-protocol/` (requêtes, réponses, événements, d'après [`../contracts/agent-protocol.md`](../contracts/agent-protocol.md)), `catalog/` (manifeste de module, catégories, champs, d'après [`../contracts/service-catalog.md`](../contracts/service-catalog.md)), `plans/` (Solo, Team, Hosted, prix), `permissions/` (rôles `owner`, `admin`, `member`, slugs `<scope>:<action>`), `api/errors.ts`. Schémas Zod et types inférés. Un fichier JSON Schema exporté pour l'agent Go (`bun run contracts:export` écrit `apps/agent/internal/contract/schema.json`).
Hors périmètre. Toute logique.
Critères d'acceptation.
1. Chaque schéma a un test qui valide un exemple et en rejette un.
2. Le JSON Schema exporté est régénéré par la CI et sa fraîcheur est vérifiée.

### INF-05 — CI GitHub Actions
Lot 0 · dépend de INF-03 · `.github/workflows`

But. Deux jobs : `Quality` (lint, check:types, test, build, séquentiels, cache Turbo) et `Agent` (go vet, go test, build multi-arch, garble en `main`).
Critères d'acceptation.
1. Une PR qui casse un test est rouge.
2. Le job `Agent` publie les binaires comme artefacts.

### INF-06 — Skills et outillage agent
Lot 0 · dépend de INF-03 · `.claude/`

But. Ce que les agents réutilisent d'une tâche à l'autre.
Périmètre. `.claude/skills/elysia-api-routes` (structure des routes, guards `requireOrg`, `requireRole`, `requireServer`, `requirePlatformAdmin`, `serializeData`), `.claude/skills/agent-modules` (écrire un module Go idempotent, le tester sur le staging), `.claude/skills/desktop-screens` (un écran de l'app : store, IPC, composant, test), `.claude/skills/release` (tag, builds, notarisation, publication), `.claude/launch.json` (`site`, `web`, `desktop`), `.claude/settings.json` (permissions `bun run *`, `bun test *`, `go test *`).
Critères d'acceptation.
1. Chaque skill a un frontmatter `name` et `description` et cite les fichiers qu'il gouverne.

### INF-07 — Contrat : champs booléens et listes dans le catalogue
Lot 0 · dépend de INF-04 · `packages/shared`, `docs/contracts/service-catalog.md`

But. Le manifeste de module sait décrire une case à cocher et une liste de valeurs, dont le catalogue a besoin (`runtime.node.bun`, `core.hardening.ssh_443`, `ai.hermes.providers[]`, `editor.vscode.extensions[]`).
Périmètre. Ajouter les kinds `boolean` (avec `default`) et `list` (éléments `text` ou `secret`, `min`, `max`) au type `Field` du contrat et au schéma Zod, régénérer le JSON Schema, mettre à jour les tests et le tableau des champs de `service-catalog.md`.
Hors périmètre. Tout module, tout écran.
Critères d'acceptation.
1. Un manifeste avec un champ `boolean` et un champ `list` de secrets est validé ; un `list` sans `items` est rejeté.
2. `bun run contracts:check` passe après régénération.

### INF-08 — Contrat : flux secret d'`install`, presets dans le schéma, code `no_report`
Lot 0 · dépend de AGT-03 · `packages/shared`, `docs/contracts/agent-protocol.md`, `.claude/skills/agent-modules`

But. Trois points qu'AGT-03 a dû trancher seul entrent dans le contrat, et le skill des modules reflète les signatures réelles.
Périmètre. Dans `agent-protocol.md` et les schémas Zod : la ligne du flux secret d'`install` est `{ "<module id>": { "<clé>": "<valeur>" } }`, miroir de `config` (schéma `InstallSecrets`) ; les presets sont exportés dans le JSON Schema avec leur contenu (`Presets` en `const`), et le test Go de `internal/contract/presets.go` compare sa copie au schéma ; un code `no_report` remplace `bad_request` pour `report` avant toute installation. Mettre à jour `.claude/skills/agent-modules/SKILL.md` avec les signatures livrées par AGT-03 (`ctx` sur tous les helpers, `modtest.NewContext(t, sys, modtest.Options{…})`, `env.Set` renvoie `(changed, err)`, `Status.Service`). Régénérer `schema.json`.
Hors périmètre. Tout module.
Critères d'acceptation.
1. `bun run contracts:check` passe après régénération ; `go test ./...` vert, dont la comparaison des presets au schéma.
2. Les trois lignes de blocage d'AGT-03 sont retirées de `TRACKING.md`.

### INF-09 — Design : ombres, rayons, espace, logos de services
Lot 0 · dépend de APP-01 · `packages/design`

But. `packages/design` expose tout ce que le système de design révisé demande, et les logos des services.
Périmètre. Dans `tokens.css`, `tailwind.css` et `tokens.ts` : les rayons (`sm` 6, `md` 10, `lg` 14, `full`), l'échelle d'espace de 4 px, les trois niveaux d'ombre avec leurs variantes sombres, les durées `fast` et `soft`. Un dossier `src/logos/` avec un SVG par module du catalogue, nommé par identifiant (`db-postgres.svg`), plus `NOTICE.md` qui donne pour chacun sa source, sa licence et la date ; source Simple Icons (CC0) quand la marque y est, kit de marque officiel sinon. Un module `src/logos/index.ts` qui associe un identifiant de module à son SVG inline et à son caractère monochrome. Tests : chaque token du frontmatter de `DESIGN.md` existe dans `tokens.css` et dans `tokens.ts` ; chaque module MVP du catalogue a son logo ; chaque SVG est bien formé, sans script, sans référence externe.
Hors périmètre. Les composants qui les consomment.
Critères d'acceptation.
1. Un test échoue si un module du catalogue MVP n'a pas de logo, ou si un logo cite une URL externe.
2. `NOTICE.md` couvre chaque fichier de `src/logos/`.

### APP-19 — Appliquer le design accueillant à l'app
Lot 2 · dépend de INF-09, APP-09 · `apps/desktop`

But. L'app passe des règles sèches d'APP-01 au système révisé : ombres douces, coins arrondis, espace, hiérarchie des menus, logos de services.
Périmètre. Les primitives de `components/ui/` et tous les écrans : élévation par `raised` et `overlay` au lieu du seul trait, rayons revus, gouttières de 20 px et sections de 32 px, listes à 12 px de padding vertical minimum, barre latérale à trois plans avec repère à gauche sur l'entrée active, `ServiceLogo` dans le catalogue, l'écran Services et les cartes de projet. Le terminal et le diff ne changent pas.
Hors périmètre. Toute fonctionnalité.
Critères d'acceptation.
1. Aucune ombre ni rayon en dur : tout vient des tokens.
2. Les captures des deux thèmes montrent des cartes posées, des coins arrondis et les logos en couleurs (APP-17 fournit le harnais).

### INF-10 — Flux secret sur l'entrée standard
Lot 0 · dépend de APP-02 · `apps/agent`, `apps/desktop`

But. Le flux secret passe par l'entrée standard, comme le contrat révisé le fixe, et non par un descripteur 3 que `ssh` ne transmet pas.
Périmètre. Côté agent : `internal/protocol/server.go` et `internal/modules/commands.go` lisent la ligne de secrets sur l'entrée standard, juste après la requête, au lieu du descripteur dédié ; les transcriptions de test suivent. Côté app : `src/main/agent-client.ts` écrit la ligne de secrets sur l'entrée standard du canal au lieu de `fd 3`, et `sshSpawn` cesse d'ouvrir un quatrième descripteur ; l'agent factice des fixtures suit.
Hors périmètre. Toute autre commande.
Critères d'acceptation.
1. Une transcription qui envoie `install` avec `secrets_stdin: true` puis sa ligne de secrets fonctionne de bout en bout, agent et client.
2. Aucun secret n'apparaît dans un événement, un rapport ou un journal : test explicite des deux côtés.
3. `grep -rn "fd 3\|stdio\[3\]" apps/desktop/src apps/agent` ne renvoie plus rien.

### INF-11 — Contrat : le verdict de la sonde
Lot 0 · dépend de AGT-02 · `packages/shared`, `docs/contracts/agent-protocol.md`

But. `ProbeResult` décrit le verdict que la sonde produit et que l'écran d'inspection affiche.
Périmètre. Ajouter au schéma `verdict` : `kind` (`bare` | `managed` | `occupied` | `incompatible`), `fixes[]` à côté de `reasons[]`, et `up_to_date` quand `kind` vaut `managed`. Élargir `arch` à une chaîne libre avec les valeurs connues documentées : une machine `incompatible` par son architecture doit pouvoir se décrire. Décider si `disk_free_gb` reste un nombre unique (le plus petit entre la racine et le dossier des projets, ce que fait AGT-02) ou devient deux champs, et l'écrire. Régénérer `schema.json`, retirer les exceptions posées par AGT-02 dans `assertContractJSON`, retirer la ligne de blocage.
Hors périmètre. La sonde elle-même, déjà livrée.
Critères d'acceptation.
1. Les deux sondes valident contre le schéma sans exception, avec `kind`, `fixes` et `up_to_date`.
2. Une machine `i686` est descriptible et rendue `incompatible`.

### INF-12 — Contrat : les releases de l'app
Lot 0 · dépend de PLT-09 · `packages/shared`, `docs/contracts/platform-api.md`, `packages/db`

But. Le contrat distingue une release de l'agent (par architecture) d'une release de l'app (par système, avec ses notes).
Périmètre. Une table `AppRelease` (`version`, `os` parmi `macos` | `windows` | `linux`, `arch?`, `url`, `sha256`, `signature?`, `notes`, `channel`, `publishedAt`) et ses routes : `POST /admin/app-releases` pour la CI, `GET /releases/app/latest?channel=` et `GET /releases/app/:version`. La console lit ces routes au lieu de dériver les liens d'une variable d'environnement, et affiche les vraies notes. Migration, schémas Zod, codes d'erreur, mise à jour de `docs/contracts/platform-api.md`.
Hors périmètre. La CI qui publiera (APP-13, APP-16).
Critères d'acceptation.
1. La page de téléchargement affiche trois systèmes, leur version et leurs notes, depuis l'API.
2. Sans release publiée, elle le dit et n'affiche aucun lien mort.

### INF-13 — Le quota gratuit vit dans le contrat partagé
Lot 0 · dépend de PLT-09 · `packages/shared`

But. Le nombre de serveurs offerts sans abonnement est déclaré une seule fois.
Périmètre. Déplacer `DEV_SEAT_QUOTA` de `packages/api/src/lib/billing/seats.ts` vers `packages/shared/src/plans`, et faire lire la console et l'API depuis là. Retirer la constante dupliquée de `apps/web`.
Critères d'acceptation.
1. Une seule occurrence du nombre dans le dépôt, hors tests.

### INF-14 — La langue de l'utilisateur est enregistrée
Lot 0 · dépend de PLT-11 · `packages/db`, `packages/api`

But. Un email déclenché par une tâche planifiée part dans la langue de son destinataire.
Périmètre. Une colonne `locale` sur `user` (défaut `fr`), posée à l'inscription depuis `Accept-Language` et modifiable dans les préférences de la console. Les emails de tolérance, de suspension et de décommission la lisent au lieu de retomber sur le français.
Critères d'acceptation.
1. Un utilisateur dont la langue est `en` reçoit l'email de suspension en anglais, déclenché hors requête.

### INF-15 — Contrat : détecter le gestionnaire d'un dépôt
Lot 0 · dépend de APP-08 · `packages/shared`, `apps/agent`

But. L'app propose le bon gestionnaire de paquets et la bonne commande de démarrage pour un dépôt qu'elle n'a pas encore ajouté.
Périmètre. Une commande `project.detect` `{ repo?, dir? }` qui, sans rien installer, cline en surface ou lit un dossier existant et renvoie `{ pkgmgr, install?, cmd?, port_hint? }`. Le remède d'un port déjà pris gagne un champ structuré (`{ code: "port_taken", port_free: 3001 }`) au lieu d'obliger l'app à lire un entier dans une phrase.
Hors périmètre. L'écran, déjà livré et qui saura s'en servir.
Critères d'acceptation.
1. Un dépôt Vite public est détecté en `bun` avec sa commande de démarrage.
2. L'app ne lit plus de port dans une chaîne de texte.

### INF-16 — Contrat : le chemin absolu d'un projet
Lot 0 · dépend de APP-09 · `packages/shared`, `apps/agent`

But. L'app connaît le dossier d'un projet sans passer par git.
Périmètre. `Project` gagne un chemin absolu, ou `Machine` la racine des projets — choisir l'un des deux et l'écrire dans `agent-protocol.md`. Aujourd'hui le seul chemin absolu vient de `project.git_status`, si bien que les boutons d'ouverture dans l'éditeur distant et le changement de dossier d'un terminal n'existent que pour un projet versionné.
Hors périmètre. Les écrans, qui sauront s'en servir.
Critères d'acceptation.
1. Un projet non versionné ouvre dans l'éditeur distant et son terminal démarre au bon endroit.

