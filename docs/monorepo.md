# Monorepo

Même outillage que React-Box, mêmes versions quand elles sont compatibles : ce qui a été vérifié là-bas n'a pas à l'être deux fois.

## Outillage

| Outil | Rôle | Note |
| --- | --- | --- |
| Bun 1.3 | gestionnaire de paquets, runtime des scripts, `bun test` | Bun uniquement, jamais npm ni pnpm. `packageManager` épinglé dans `package.json` |
| Turbo 2 | graphe de tâches, cache, `--affected` | `envMode` strict : une variable non déclarée dans `globalPassThroughEnv` n'atteint aucune tâche |
| Biome via Ultracite | lint et format | `biome.jsonc` racine étend `ultracite/biome/core`, `semicolons: "asNeeded"`. Même épingle qu'React-Box (`7.8.3`) tant que la mise à niveau n'a pas été faite là-bas |
| tsgo | typecheck | `@typescript/native-preview`, TypeScript 6 |
| Husky + commitlint | hooks | pre-commit : `ultracite fix` par workspace sur les fichiers indexés ; pre-push : lint, `check:types`, `test` affectés ; commits conventionnels |
| Prisma 7 | schéma et migrations | client généré committé, empreinte `packages/db/src/generated/.prisma-inputs.sha256` vérifiée au lint par `scripts/check-prisma-client-freshness.ts` ; `db:migrate` et `db:migrate:reset` exigent `PUPITRE_ALLOW_MIGRATE_ON=staging` ou `local` |
| Wrangler 4 | Workers, Pages, R2, secrets | `secrets.required` déclarés dans `wrangler.jsonc`, vérifiés avant déploiement |
| Go 1.25+ | l'agent | `gofmt`, `go vet`, `go test`, `garble` en release. Installé par Homebrew sur la machine du propriétaire |
| electron-vite, electron-builder | l'app desktop | bytecode du main et du preload, notarisation |

## Développement local

```bash
bun install
bun dev              # site sur :4321, web sur :3000
bun run dev:desktop  # l'app, pointée sur le staging par défaut
```

`bun run dev:web` lance Vite et TanStack Start sous le plugin Cloudflare, avec les bindings locaux. Neon local via `neonctl` ou une branche de dev ; `DATABASE_URL` dans `.env.local`. L'agent se teste sur un VPS de staging réinstallable (`bun --cwd=apps/agent run staging:reset`), jamais sur la machine du propriétaire.

## Vérifications

```bash
bun run lint          # boundaries, ultracite, gofmt et go vet
bun run check:types
bun run test
bun run build
```

Les PR font tourner les tâches affectées ; `main` fait tout.

## Frontières de workspace

`scripts/assert-package-boundaries.ts` refuse : un import entre deux `apps/*` ; un import de `@pupitre/api/lib/*` hors de `packages/api` ; un import des entrées Prisma Node dans `packages/api/src`, `apps/web/src` ; un import de `packages/shared` depuis `apps/agent` autrement que par le JSON Schema exporté.

## Secrets

- Jamais dans le dépôt. Le hook pre-commit refuse toute chaîne ressemblant à une clé API, un jeton ou une clé privée.
- Local : `.env.local` racine, ignoré, symlinké dans `apps/web/`. Modèle : `.env.example`.
- Production : secrets Wrangler. `wrangler.jsonc` déclare `secrets.required` ; `scripts/check-worker-secrets.ts` compare avec ce qui est lié au Worker et refuse le déploiement s'il en manque un.
- Signature : certificats Apple et Azure Trusted Signing dans les secrets GitHub Actions uniquement.

## Cloudflare Builds

| Service | Commande de build | Commande de déploiement |
| --- | --- | --- |
| web | `bun install --frozen-lockfile && bun --cwd=packages/db run db:migrate:deploy && bun --cwd=apps/web run build:cloudflare` | `bun scripts/check-worker-secrets.ts web && cd apps/web/dist/server && bun x wrangler deploy --config wrangler.json --keep-vars` |
| site | `bun install --frozen-lockfile && bun --cwd=apps/site run build` | Pages, `apps/site/dist` |

Deux environnements : `staging` (`staging.pupitre.sh`, `staging-app.pupitre.sh`, Stripe en mode test, branche Neon `staging`) et `production` (branche Neon `production`). L'app desktop de développement pointe sur `staging`.

## Neon

Projet `pupitre` (`royal-morning-15862824`, [console](https://console.neon.tech/app/projects/royal-morning-15862824)), région `aws-eu-central-1`, Postgres 18, créé le 4 septembre 2026. C'est la région sur laquelle le Worker `apps/web` est épinglé (`placement` dans `wrangler.jsonc`). Branche `production` par défaut ; branche `staging` pour le staging et la CI de migration ; les branches de développement se créent depuis `staging` avec `neonctl`. `DATABASE_URL` utilise l'endpoint poolé de la branche visée ; `MIGRATE_DATABASE_URL` l'endpoint direct (sans `-pooler`), le seul que Prisma Migrate accepte. `db:migrate:deploy` lit `MIGRATE_DATABASE_URL` et refuse de migrer une autre branche que celle de `DATABASE_URL`.

## Dépendances

Les `overrides` du `package.json` racine sont la seule source de vérité de l'arbre d'installation ; Bun ignore les overrides par workspace. Chaque épingle a une raison écrite ici ; on n'en ajoute pas sans `bun audit` et un `bun run build` qui passent.

Épingles héritées de React-Box, à revérifier à la première mise à niveau : `typescript ^6` (TS 7 casse encore des outils), `ultracite 7.8.3` (la version suivante reformate tout le dépôt), `better-auth` exact (les mineures ont déjà cassé `customSession`).

## Dashboards externes

Cloudflare Builds, Stripe, Neon (projet `pupitre`), Apple Developer, Azure Trusted Signing, GitHub Releases. Ce document est ce qui les décrit ; rien dans le dépôt ne peut vérifier ce qu'ils exécutent. Quand un tableau ci-dessus change, le dashboard change dans la même passe.
