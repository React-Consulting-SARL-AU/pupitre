# Pupitre

Monorepo privé du produit Pupitre : une app desktop qui transforme un VPS Ubuntu en atelier pour agents IA, et l'agent compilé posé sur ce serveur.

Le produit est fermé et commercial. Rien de ce dépôt n'est publié ; son usage est soumis à la notice [`LICENSE`](./LICENSE). La documentation vit dans [`docs/`](./docs/README.md).

## Structure

- `apps/site` — site marketing (Astro)
- `apps/web` — console, `/api/v1` et `/api/auth` (TanStack Start sur Cloudflare Workers)
- `apps/desktop` — l'app (Electron)
- `apps/agent` — `pupitred`, l'agent Go installé sur le serveur du client
- `packages/*` — `db`, `auth`, `api`, `shared`, `design`
- `docs/` — produit, architecture, contrats, décisions, plans, suivi
- `app/` — LEGACY, l'app Electron d'origine, déplacée vers `apps/desktop`
- `server/` — LEGACY, la stack bash d'origine, spécification des modules de l'agent Go

## Démarrer

```bash
bun install
bun dev                 # site + web
bun run lint
bun run check:types
bun run test
```

Bun uniquement. Les autres commandes sont listées dans [`CLAUDE.md`](./CLAUDE.md).

## Lire ensuite

- [`docs/README.md`](./docs/README.md) — la carte de la documentation
- [`CLAUDE.md`](./CLAUDE.md) — les règles du monorepo et la façon de travailler par tâche
- [`docs/TRACKING.md`](./docs/TRACKING.md) — l'état de chaque tâche
