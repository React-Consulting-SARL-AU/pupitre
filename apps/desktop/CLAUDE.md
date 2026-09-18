# apps/desktop — Guidelines

L'app Electron. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · fonctionnement interne → [`docs/desktop.md`](../../docs/desktop.md) · protocole → [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md) · migrations → [`docs/contracts/config-migrations.md`](../../docs/contracts/config-migrations.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md) · construire un écran → skill `desktop-screens`.

> Le style est enforced par Ultracite (Biome). Ce fichier ne contient que ce que le linter ne dérive pas.

## Stack imposée

Electron 44 · electron-vite (bytecode sur le main seul, le preload reste du JavaScript) · React 19 · Tailwind 4 sur les tokens de `@pupitre/design` · Base UI + shadcn/ui, prop `render`, jamais `asChild` · Zustand · xterm + node-pty · `ssh` du système, jamais une bibliothèque SSH en JavaScript · Lucide uniquement.

**Banned** : `@radix-ui/*`, `ssh2`, `node-ssh`, `axios`, toute couleur en dur.

## Ce que l'app ne fait jamais

- Elle n'a pas de second modèle : elle affiche ce que `snapshot` renvoie. Une information nouvelle apparaît dans l'agent d'abord.
- Le renderer ne touche pas au système : `contextIsolation` on, `nodeIntegration` off, surface explicite dans `src/preload`. Il nomme un serveur, un projet, une action ; le main valide le nom contre ce que l'agent vient de donner.
- Jamais un `ssh` par appel : un client par serveur (`agent-client.ts`), quatre canaux — contrôle, travail, battement (`agentPoll`), suivi (journaux). → [canaux](../../docs/desktop.md#les-canaux-vers-lagent)
- Jamais `~/.ssh/config` réécrit : la config SSH est celle de l'app (`userData/ssh/config`, `-F`), partagée par une ligne `Include` sur geste explicite. → [SSH](../../docs/desktop.md#ssh--configuration-clés-partage)
- Jamais un secret dans un store, un log, une commande ou une ligne de commande : flux secret du protocole, `SSH_ASKPASS` pour un mot de passe, oublié après l'envoi. → [clé](../../docs/desktop.md#poser-la-clé-sur-un-serveur)
- Jamais le jeton bearer hors de `safeStorage` ni à travers le pont. Sans compte, seul un build de développement installe ; la sorte de build suit la plateforme, pas le dossier. → [compte](../../docs/desktop.md#le-compte-et-linstallation)
- Jamais un fichier lourd sur le canal de l'agent : `rsync` ou `scp` sur la session SSH de l'app, chemin distant validé par le main, chemin local d'une boîte de dialogue. → [transferts](../../docs/desktop.md#les-transferts)
- Jamais un fichier de l'app réécrit sans révision : `servers.json`, `account.json`, `transfers.json` passent par `store-migrations.ts`, une entrée numérotée par changement de forme. → [fichiers](../../docs/desktop.md#les-fichiers-que-lapp-garde)
- Jamais `upgrade` des modules avant `agent.upgrade`, fermeture du canal, `agent.migrate`. → [mise à jour](../../docs/desktop.md#mettre-lagent-à-jour)
- Jamais un écran de l'onboarding qui agit dans un `useEffect` : `stores/onboarding-machine.ts` décide, le store exécute. → [onboarding](../../docs/desktop.md#lonboarding)
- Jamais une valeur qui sent le secret dans `trace.ts`. Rien de tracé dans un build empaqueté.

## Ce que chaque écran fait

- `Screen` · `Section` · `Panel` · `Fact` ; `eyebrow` = le contexte, `title` = la chose ; jamais de carte, de libellé ou de bandeau posés à la main.
- Tout contrôle vient de `components/ui/` sur Base UI : `Select`, `NumberField`, `CheckBox` / `CheckLine`, `Switch` / `SwitchLine`, `RadioGroup` / `Radio` / `RadioLine`, `ModeCards` / `ModeCard`, `Segmented`, `TabBar` / `Tab`, `Details`, `FoldingSection` (une section qui se plie sous son titre, pour une page lue par morceaux), `Dialog`, `ConfirmButton`, `Menu`, `Tooltip`, `Hint`. Jamais un `<select>`, un `<details>`, un `<input type="checkbox">` ou un `role="dialog"` écrits à la main. Ce qui flotte passe par un portail : un test qui le lit monte le composant avec `__tests__/dom.tsx` (`mount`, `optionsOf`) plutôt que `renderToStaticMarkup`.
- Un formulaire est une suite de `Section`, chacune sur un `Panel inset="lg"` ; les champs y respirent en `gap-6` ; les préférences sont des `SwitchLine` avec leur conséquence en `detail` ; les réglages tiennent en une colonne de `Tab` verticaux et une pane.
- Chaque geste répond là où il a été fait : un gestionnaire asynchrone retourne sa promesse, `Button` / `IconButton` / `ConfirmButton` passent en `loading` seuls (`usePending`).
- Chaque attente dit ce qui se passe ; chaque erreur dit le remède, `fix` de l'agent affiché tel quel ; un champ refusé porte sa phrase, `aria-invalid`, `aria-describedby`.
- Chaque bouton à icône porte une infobulle (`ui/tooltip.tsx`) ; le `title` natif ne s'affiche pas sur macOS.
- Un formulaire finit sur son bouton au pied, actif quand quelque chose a changé.
- Aucune phrase hors de `i18n/strings`, `en` et `fr`.
- Pas de description, d'intro ou de note qui raconte l'écran.

## Conventions de fichiers

- Fichiers `{feature}-{context}-{type}.tsx` ; un composant React par fichier hors `components/ui/` ; pas de barrel file ; points-virgules (`biome.jsonc`).
- `src/main/<sujet>.ts` enregistre les handlers, `<sujet>-run.ts` tient le déroulé pur avec ses dépendances en paramètre.
- Un store Zustand par sujet, l'état en union discriminée par `status`.
- Arborescence complète → [docs/desktop.md](../../docs/desktop.md#arborescence).

## Tests

`bun test` pour le main (agent factice, transcriptions dans `src/main/__tests__/fixtures/`) et les stores (`stubPupitre`) ; Playwright dans `e2e/` avec une passe axe sur chaque écran. Assertions dans `it()`, `async/await`, pas de `.only` committé. La suite ne montre jamais la fenêtre. Détails et captures → [docs/desktop.md](../../docs/desktop.md#tests).

Les tests verts ne suffisent pas : un changement d'écran se vérifie dans l'app lancée (`bun run dev:desktop`) avant d'être annoncé.

## Commandes

```bash
bun run dev:web           # depuis la racine : la console que l'app appelle en développement
bun run dev
bun run dev:desktop:prod  # depuis la racine : la même app, sur app.pupitre.studio
bun run build             # typecheck + bundle
bun run build:mac
bun run test
bun run test:e2e
```
