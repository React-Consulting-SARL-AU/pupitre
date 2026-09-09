# apps/desktop — Guidelines

L'app Electron. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · protocole → [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md).

> Le style est enforced par Ultracite (Biome). Ce fichier ne contient que ce que le linter ne dérive pas.

## Stack imposée

Electron 42 · electron-vite (bytecode sur main et preload) · React 19 · Tailwind 4 sur les tokens de `@pupitre/design` · Base UI + shadcn/ui, prop `render`, jamais `asChild` · Zustand pour l'état client · xterm + node-pty · `ssh` du système, jamais une bibliothèque SSH en JavaScript · Lucide uniquement.

**Banned** : `@radix-ui/*`, `ssh2`, `node-ssh`, `axios`, toute couleur en dur.

## Principes

- **L'app est un client de l'agent.** Elle affiche ce que `snapshot` renvoie et n'a pas de second modèle. Une information nouvelle apparaît dans l'agent d'abord.
- **Le renderer ne touche pas au système.** `contextIsolation` on, `nodeIntegration` off, surface explicite dans `src/preload`. Le renderer nomme un projet et une action ; le main valide le nom contre la liste que l'agent vient de donner avant d'en faire une commande.
- **Un canal par serveur.** `src/main/agent-client.ts` tient une session SSH qui lance `pupitred serve` ; requêtes sérialisées, `id` croissant, second canal pour les commandes longues. Jamais de `ssh` par appel.
- **La config SSH est celle de l'app** : `userData/ssh/config` passé avec `-F`, clés dans `userData/keys/` en 0600, clé d'hôte épinglée. `~/.ssh/config` de l'utilisateur n'est jamais écrit. Un hôte existant peut être désigné.
- **L'app pose sa clé elle-même.** `key-install.ts` essaie dans l'ordre : la machine s'ouvre déjà, ce que l'ordinateur détient déjà l'ouvre, puis le mot de passe du compte distant. Le mot de passe traverse le pont une fois, part par l'aide `SSH_ASKPASS` — jamais une ligne de commande, jamais un fichier — et est oublié. On ne rend la ligne `ssh-copy-id` à coller que quand l'app ne peut pas faire le travail.
- **En développement, tout se trace.** `trace.ts` écrit ce que fait le processus principal — chaque `ssh`, chaque commande de l'agent, chaque phase d'un enrôlement — sur la sortie du processus principal et dans la console de la fenêtre. Rien dans un build empaqueté ; `PUPITRE_TRACE=1` l'allume ailleurs. Aucune valeur dont le nom sent le secret n'y est écrite.
- **Aucun secret dans un store, un log ou une commande.** Les secrets partent par le flux secret du protocole et sont oubliés.
- **Le compte décide de l'installation.** Le jeton bearer vit dans `safeStorage` et ne traverse jamais le pont ; le serveur est enrôlé auprès de la plateforme, puis le binaire de l'agent est téléchargé depuis elle, somme et signature vérifiées, avant d'être poussé. Sans compte, seul un build de développement installe. Un build de développement parle à la console locale — `http://localhost:3000`, celle que `bun run dev:web` sert — et un build empaqueté à `app.pupitre.studio` ; `PUPITRE_PLATFORM_URL` désigne une autre plateforme.
- **Chaque attente dit ce qui se passe, chaque erreur dit le remède.** Le `fix` renvoyé par l'agent est affiché tel quel.
- **L'ordre de l'onboarding est une machine, les écrans dessinent.** `stores/onboarding-machine.ts` dit quelle étape suit quelle réponse et ce qu'entrer dans une étape déclenche ; le store exécute les effets. Aucun écran n'agit dans un `useEffect`, et une étape ne se rejoint que par un événement qui la justifie.
- **Chaque geste répond là où il a été fait** et **l'accessibilité est une exigence**, toutes deux spécifiées dans [DESIGN.md](../../docs/product/DESIGN.md). Un bouton qui déclenche un travail passe en `loading` — `Button`, `IconButton` et `ConfirmButton` le font seuls dès que le gestionnaire rend la promesse du travail (`usePending`), donc un gestionnaire asynchrone retourne toujours sa promesse ; un champ refusé porte sa phrase, `aria-invalid` et `aria-describedby`.

## Architecture

```
src/main/        index.ts · agent-client.ts · servers.ts · keys.ts · key-install.ts · trace.ts · terminals.ts · terminal-run.ts · login-view.ts · account.ts · updater.ts · completion.ts
src/preload/     index.ts — la surface IPC, typée
src/renderer/src/
  components/ui/          Base UI + shadcn, un composant par fichier
  components/onboarding/  onboarding-machine (l'ordre, pur) · shell + corps · server · inspection · agent · catalog · config · install · harden
  components/connections/ les comptes tiers que l'app tient pour le client
  components/dashboard, projects, terminals, agents, services, shots, settings, account
  stores/                 servers · snapshot · onboarding · theme · account
  lib/                    memory.ts (navigation), completion.ts, terminals.ts
```

Fichiers `{feature}-{context}-{type}.tsx`. Hors `components/ui/`, un composant React par fichier. Pas de barrel files.

## Tests

`bun test` pour le main et les stores (agent factice qui rejoue des transcriptions dans `src/main/__tests__/fixtures/`), Playwright pour Electron dans `e2e/` : l'onboarding complet et la configuration contre le harnais de `e2e/harness/onboarding.ts`, captures des thèmes, et une passe axe sur chaque écran couvert (`e2e/harness/accessible.ts`). Assertions dans `it()`, `async/await`, pas de `.only` committé. Les captures du tableau de bord ne sont comparées que sur macOS, où vivent leurs références (`e2e/references/*-darwin.png`) ; elles se régénèrent avec `bunx playwright test e2e/themes.spec.ts --update-snapshots` quand l'écran change exprès. Sur Linux, le scénario vérifie le thème sans image.

## Commandes

```bash
bun run dev:web        # depuis la racine : la console que l'app appelle en développement
bun run dev
bun run build          # typecheck + bundle
bun run build:mac
bun run test
bun run test:e2e
```
