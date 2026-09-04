# Pupitre Monorepo — Claude/Codex Guidelines

Source de vérité du monorepo. Lis aussi le guide du workspace que tu touches :

- Site marketing : [`apps/site/CLAUDE.md`](./apps/site/CLAUDE.md)
- Plateforme (console + API + auth) : [`apps/web/CLAUDE.md`](./apps/web/CLAUDE.md)
- App desktop : [`apps/desktop/CLAUDE.md`](./apps/desktop/CLAUDE.md)
- Agent serveur : [`apps/agent/CLAUDE.md`](./apps/agent/CLAUDE.md)
- Produit : [`docs/product/PRODUCT.md`](./docs/product/PRODUCT.md) · design : [`docs/product/DESIGN.md`](./docs/product/DESIGN.md)
- Plans et suivi : [`docs/plans/README.md`](./docs/plans/README.md) · [`docs/TRACKING.md`](./docs/TRACKING.md)

Pupitre est un produit **fermé et commercial**. Rien de ce dépôt n'est publié. Tout le code est produit par des agents ; le propriétaire du projet spécifie, relit et valide.

## Structure

```txt
apps/site        Astro — pupitre.studio : marketing, docs publiques, blog, légal, téléchargement
apps/web         TanStack Start sur Cloudflare Workers — app.pupitre.studio : console, /api/v1 (Elysia), /api/auth (Better Auth)
apps/desktop     Electron — l'app : onboarding d'un VPS, catalogue de services, projets, terminaux, agents
apps/agent       Go — pupitred, l'agent compilé installé sur le VPS du client

packages/db      schéma Prisma + migrations Neon + clients générés (Node et Cloudflare)
packages/auth    Better Auth : configuration serveur, plugins, clients web et desktop
packages/api     app Elysia /api/v1, client Eden, harnais de test API/DB
packages/shared  contrats partagés : protocole agent, catalogue de services, plans, permissions, erreurs API
packages/design  tokens CSS monochrome + preset Tailwind, partagés par site, web et desktop

docs/            produit, architecture, contrats, décisions, plans d'implémentation, suivi
server/          LEGACY — la stack bash/zsh d'origine. Spécification des modules Go. Supprimée quand l'agent la couvre.
```

## Commands

Bun uniquement.

```bash
bun install
bun dev                 # site + web
bun run dev:site
bun run dev:web
bun run dev:desktop
bun run build:agent     # go build, toutes architectures
bun run lint
bun run lint:fix
bun run check:types
bun run test
bun run build
bun run db:generate
bun run db:migrate
```

Commandes d'un seul workspace : `bun --cwd=<workspace> run <script>`.

## Rules

- **Les règles qui ne bougent pas** (voir [`docs/architecture.md`](./docs/architecture.md)) : le serveur du client est la source de vérité de ce qui le concerne ; aucune clé privée hors du laptop du client ; aucune connexion entrante vers le serveur du client ; rien de lisible déposé sur le serveur, un binaire et des fichiers de configuration ; l'app reste utilisable sept jours sans la plateforme.
- **Le contrat d'abord.** Tout ce qui traverse une frontière (app ↔ agent, app ↔ plateforme, console ↔ API) est typé dans `packages/shared` avant d'être implémenté des deux côtés. Un agent ne modifie pas un contrat au fil de l'eau : il ouvre une tâche de contrat.
- **Réutilise avant de créer.** Cherche une primitive existante (`components/ui`, `hooks`, `lib`) et étends-la par `variant`/prop plutôt que de la dupliquer.
- **Le design est enforced** par [`DESIGN.md`](./docs/product/DESIGN.md) : monochrome, tokens sémantiques uniquement, jamais de couleur en dur, la couleur ne sert que l'état.
- **Pas de nouveau package partagé au fil de l'eau.** On en crée un quand deux workspaces partagent réellement un contrat stable.
- Hors `components/ui`, exactement un composant React par fichier ; sous-composants dans des fichiers frères.
- Les artefacts générés restent hors de Git, sauf `apps/web/src/routeTree.gen.ts` et le client Prisma sous `packages/db/src/generated/` (le pipeline Cloudflare Builds en a besoin avant l'installation).
- **Secrets** : jamais dans le dépôt. `.env.local` à la racine (ignoré), secrets Wrangler en production, hook de détection avant commit.
- **Git — ne commit/push que sur demande explicite.** Applique les changements puis arrête-toi pour revue. Jamais `--force` ni `--no-verify`.
- Avant un commit : `bun run lint:fix`. Avant un push, le hook lance lint, typecheck et tests affectés.
- Commits en Conventional Commits, avec l'identifiant de tâche dans le sujet : `feat(desktop): APP-04 écran d'inspection`.

## Travailler par tâche

1. Lis ce fichier, le guide du workspace, le plan de la tâche dans `docs/plans/`, et les contrats concernés dans `docs/contracts/`.
2. Passe la tâche en `en cours` dans [`docs/TRACKING.md`](./docs/TRACKING.md), avec la branche.
3. Écris d'abord les tests d'acceptation qui traduisent les critères de la tâche, puis le code.
4. Reste dans le périmètre de la tâche et dans ton workspace. Un besoin dans un autre workspace devient une tâche, pas une incursion.
5. Lint, typecheck, tests verts. Passe la tâche en `en revue`, arrête-toi.

## External Configs

Cloudflare Builds, Stripe, Neon et les certificats de signature vivent dans des dashboards, hors du dépôt : garde [`docs/monorepo.md`](./docs/monorepo.md) synchronisé avec eux.
