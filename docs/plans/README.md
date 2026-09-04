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
Périmètre. `.claude/skills/elysia-api-routes` (structure des routes, `requireOrg`, `hasPermission`, `serializeData`), `.claude/skills/agent-modules` (écrire un module Go idempotent, le tester sur le staging), `.claude/skills/desktop-screens` (un écran de l'app : store, IPC, composant, test), `.claude/skills/release` (tag, builds, notarisation, publication), `.claude/launch.json` (`site`, `web`, `desktop`), `.claude/settings.json` (permissions `bun run *`, `bun test *`, `go test *`).
Critères d'acceptation.
1. Chaque skill a un frontmatter `name` et `description` et cite les fichiers qu'il gouverne.
