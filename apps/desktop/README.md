# Pupitre — l'app desktop

L'app Electron qui installe et pilote un serveur par SSH, en parlant à `pupitred`, l'agent qu'elle y pose. Ce qu'elle fait de l'intérieur est dans [`docs/desktop.md`](../../docs/desktop.md), ses règles dans [`CLAUDE.md`](./CLAUDE.md), le protocole dans [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md).

## Lancer

```bash
bun install               # depuis la racine du monorepo
bun run dev:desktop       # l'app, pointée sur la console locale
bun run dev:desktop:prod  # la même app, pointée sur app.pupitre.studio : le vrai compte, les vrais serveurs
```

Les deux construisent d'abord l'agent (`apps/agent/dist`), que l'app pousse sur un serveur nu. Un compte est requis : l'app demande une connexion au premier lancement.

`node-pty` est un module natif : `postinstall` le recompile par `electron-rebuild`. Sans cette étape, l'app démarre et aucun terminal ne s'ouvre. `electron` et `node-pty` sont dans les `trustedDependencies` du `package.json` racine, sans quoi Bun ne lance pas leurs scripts d'installation. Une installation qui ne résout rien de neuf ne les rejoue pas : si `node_modules/electron/path.txt` est vide, le binaire manque, et il se remet par

```bash
cd apps/desktop && node node_modules/electron/install.js
```

## Construire

```bash
bun run build        # typecheck et bundle, sans empaquetage
bun run build:mac    # .dmg arm64 et x64
bun run build:linux  # AppImage et .deb
bun run build:win    # installateur NSIS
```

Chaque système se construit sur lui-même : `node-pty` ne se compile pas pour un autre. Une release construit les trois sur ses runners (`.github/workflows/release.yml`, voir [`docs/monorepo.md`](../../docs/monorepo.md#ce-que-fait-chaque-release)). Le processus principal est compilé en bytecode V8, ce qui demande le binaire Electron au moment du build. Sans identité de signature à portée, electron-builder le dit et produit un artefact non signé, ce que veut un build sur le poste.

## Tester

```bash
bun run test      # main et stores, contre les transcriptions de l'agent factice
bun run test:e2e  # construit, puis pilote la vraie fenêtre par Playwright, sans jamais la montrer
```

Les captures du tableau de bord (`e2e/references/*-darwin.png`) ne se comparent que sur macOS et se régénèrent exprès, diff relu : `bunx playwright test e2e/themes.spec.ts --update-snapshots`. La tolérance (`threshold: 0.05`, `maxDiffPixelRatio: 0.0003`) absorbe le rendu des glyphes après une mise à niveau d'Electron, pas un changement d'écran. La CI ne lance pas la suite e2e : elle se passe sur la machine du propriétaire avant une pull request.
