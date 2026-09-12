# Pupitre Monorepo — Claude/Codex Guidelines

Source de vérité du monorepo. Lis aussi le guide du workspace que tu touches :

- Site marketing : [`apps/site/CLAUDE.md`](./apps/site/CLAUDE.md)
- Plateforme (console + API + auth) : [`apps/web/CLAUDE.md`](./apps/web/CLAUDE.md)
- App desktop : [`apps/desktop/CLAUDE.md`](./apps/desktop/CLAUDE.md)
- Agent serveur : [`apps/agent/CLAUDE.md`](./apps/agent/CLAUDE.md)
- Produit : [`docs/product/PRODUCT.md`](./docs/product/PRODUCT.md) · design : [`docs/product/DESIGN.md`](./docs/product/DESIGN.md)

Pupitre est un produit **fermé et commercial**. Rien de ce dépôt n'est publié. Tout le code est produit par des agents ; le propriétaire du projet spécifie, relit et valide.

## Structure

```txt
apps/site        Astro — pupitre.studio : marketing, docs publiques, blog, légal, téléchargement
apps/web         TanStack Start sur Cloudflare Workers — app.pupitre.studio : console, /api/v1 (Elysia), /api/auth (Better Auth)
apps/desktop     Electron — l'app : onboarding d'un VPS, catalogue de services, projets, terminaux, agents
apps/agent       Go — pupitred, l'agent compilé installé sur le VPS du client

packages/db      schéma Prisma + migrations SQL de D1 + clients générés (Bun et Cloudflare)
packages/auth    Better Auth : configuration serveur, plugins, clients web et desktop
packages/api     app Elysia /api/v1, client Eden, harnais de test API/DB
packages/shared  contrats partagés : protocole agent, catalogue de services, plans, permissions, erreurs API
packages/design  tokens CSS monochrome + preset Tailwind, partagés par site, web et desktop

docs/            produit, architecture, contrats, décisions
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
- **Une mise à jour ne réinstalle rien.** Tout changement de forme d'un fichier de configuration — `/etc/pupitre` sur le VPS, les fichiers de l'app sur le laptop — s'accompagne d'une migration numérotée dans le registre correspondant, jamais d'un « le code lira les deux formes ». Les règles et la marche à suivre sont dans [`docs/contracts/config-migrations.md`](./docs/contracts/config-migrations.md), et le skill `config-migrations` les applique.
- **Le contrat d'abord.** Tout ce qui traverse une frontière (app ↔ agent, app ↔ plateforme, console ↔ API) est typé dans `packages/shared` avant d'être implémenté des deux côtés. Un agent ne modifie pas un contrat au fil de l'eau : il s'arrête et le signale au propriétaire.
- **Réutilise avant de créer.** Cherche une primitive existante (`components/ui`, `hooks`, `lib`) et étends-la par `variant`/prop plutôt que de la dupliquer.
- **Le design est enforced** par [`DESIGN.md`](./docs/product/DESIGN.md) : monochrome, tokens sémantiques uniquement, jamais de couleur en dur, la couleur ne sert que l'état.
- **Pas de nouveau package partagé au fil de l'eau.** On en crée un quand deux workspaces partagent réellement un contrat stable.
- **Commentaires toujours en anglais.** Même règle que le reste (dernier recours, une ligne, jamais de bannière) mais jamais en français ni dans aucune autre langue. Un commentaire existant en français se corrige dès qu'on touche le fichier.
- **Qualité exigeante, sans compromis.** Zéro erreur de lint/typecheck, zéro code mort, zéro duplication évitable, gestion d'erreurs uniquement aux frontières réelles (entrée utilisateur, API externe). Un correctif ne s'accompagne pas de nettoyage hors périmètre, mais le code touché doit sortir irréprochable.
- **Config externalisée par défaut.** Toute valeur qui peut varier entre environnements (URL, clé, seuil, flag, délai) va en variable d'environnement ou dans la config partagée existante (`packages/shared`, `packages/design`) — jamais en dur dans le code applicatif. Ça ne crée pas de nouveau package partagé (règle ci-dessus) : on étend l'existant.
- Hors `components/ui`, exactement un composant React par fichier ; sous-composants dans des fichiers frères.
- Les artefacts générés restent hors de Git, sauf `apps/web/src/routeTree.gen.ts` et le client Prisma sous `packages/db/src/generated/` (le pipeline Cloudflare Builds en a besoin avant l'installation).
- **Secrets** : jamais dans le dépôt. `.env.local` à la racine (ignoré), secrets Wrangler en production, hook de détection avant commit.
- **Git — ne commit/push que sur demande explicite.** Applique les changements puis arrête-toi pour revue. Jamais `--force` ni `--no-verify`.
- **`main` est la production et ne se touche pas en local.** Le travail va sur `staging` ou sur une branche qui en part ; `main` ne change que par la pull request `staging` → `main` qu'une release ouvre et fusionne, par un merge commit. Il n'y a pas de staging en ligne : tout s'essaie en local. Les hooks refusent le commit et le push sur `main` (`scripts/assert-branch-writable.ts`, exception `PUPITRE_ALLOW_MAIN=1`). Voir [`docs/monorepo.md`](./docs/monorepo.md#branches).
- Avant un commit : `bun run lint:fix`. Avant un push, le hook lance lint, typecheck et tests affectés.
- Commits en Conventional Commits : `feat(desktop): écran d'inspection`.

## Travailler

1. Lis ce fichier, le guide du workspace que tu touches, et les contrats concernés dans `docs/contracts/`.
2. Écris d'abord les tests qui traduisent le comportement attendu, puis le code.
3. Reste dans le périmètre demandé et dans ton workspace. Un besoin découvert ailleurs se signale au propriétaire, il ne se règle pas au passage.
4. Lint, typecheck, tests verts, puis arrête-toi.

## External Configs

Cloudflare Builds, D1, Stripe et les certificats de signature vivent dans des dashboards, hors du dépôt : garde [`docs/monorepo.md`](./docs/monorepo.md) synchronisé avec eux.
