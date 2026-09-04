# apps/desktop — Guidelines

L'app Electron. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · plan → [`docs/plans/desktop-and-agent.md`](../../docs/plans/desktop-and-agent.md) · protocole → [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

> Le style est enforced par Ultracite (Biome). Ce fichier ne contient que ce que le linter ne dérive pas.

## Stack imposée

Electron 42 · electron-vite (bytecode sur main et preload) · React 19 · Tailwind 4 sur les tokens de `@pupitre/design` · Base UI + shadcn/ui, prop `render`, jamais `asChild` · Zustand pour l'état client · xterm + node-pty · `ssh` du système, jamais une bibliothèque SSH en JavaScript · Lucide uniquement.

**Banned** : `@radix-ui/*`, `ssh2`, `node-ssh`, `axios`, toute couleur en dur.

## Principes

- **L'app est un client de l'agent.** Elle affiche ce que `snapshot` renvoie et n'a pas de second modèle. Une information nouvelle apparaît dans l'agent d'abord.
- **Le renderer ne touche pas au système.** `contextIsolation` on, `nodeIntegration` off, surface explicite dans `src/preload`. Le renderer nomme un projet et une action ; le main valide le nom contre la liste que l'agent vient de donner avant d'en faire une commande.
- **Un canal par serveur.** `src/main/agent-client.ts` tient une session SSH qui lance `pupitred serve` ; requêtes sérialisées, `id` croissant, second canal pour les commandes longues. Jamais de `ssh` par appel.
- **La config SSH est celle de l'app** : `userData/ssh/config` passé avec `-F`, clés dans `userData/keys/` en 0600, clé d'hôte épinglée. `~/.ssh/config` de l'utilisateur n'est jamais écrit. Un hôte existant peut être désigné.
- **Aucun secret dans un store, un log ou une commande.** Les secrets partent par le flux secret du protocole et sont oubliés.
- **Chaque attente dit ce qui se passe, chaque erreur dit le remède.** Le `fix` renvoyé par l'agent est affiché tel quel.

## Architecture

```
src/main/        index.ts · agent-client.ts · servers.ts · keys.ts · terminals.ts · account.ts · updater.ts · completion.ts
src/preload/     index.ts — la surface IPC, typée
src/renderer/src/
  components/ui/          Base UI + shadcn, un composant par fichier
  components/onboarding/  add-server · inspection · catalog · configure · install · harden · first-project
  components/dashboard, projects, terminals, agents, services, settings, account
  stores/                 servers · snapshot · onboarding · theme · account
  lib/                    memory.ts (navigation), completion.ts, terminals.ts
```

Fichiers `{feature}-{context}-{type}.tsx`. Hors `components/ui/`, un composant React par fichier. Pas de barrel files.

## Tests

`bun test` pour le main et les stores (agent factice qui rejoue des transcriptions dans `src/main/__tests__/fixtures/`), Playwright pour Electron dans `e2e/` (onboarding complet contre le staging, captures des trois thèmes). Assertions dans `it()`, `async/await`, pas de `.only` committé.

## Commandes

```bash
bun run dev
bun run build          # typecheck + bundle
bun run build:mac
bun run test
bun run test:e2e
```
