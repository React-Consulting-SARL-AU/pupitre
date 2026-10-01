# Pupitre — the desktop app

The Electron app that installs and drives a server over SSH, talking to `pupitred`, the agent it places there. What it does on the inside is in [`docs/desktop.md`](../../docs/desktop.md), its rules in [`CLAUDE.md`](./CLAUDE.md), the protocol in [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md).

## Run

```bash
bun install               # from the monorepo root
bun run dev:desktop       # the app, pointed at the local console
bun run dev:desktop:prod  # the same app, pointed at app.pupitre.studio: the real account, the real servers
```

Both build the agent first (`apps/agent/dist`), which the app pushes to a bare server. An account is required: the app asks for a sign-in on first launch.

`node-pty` is a native module: `postinstall` recompiles it through `electron-rebuild`. Without this step, the app starts and no terminal opens. `electron` and `node-pty` are in the `trustedDependencies` of the root `package.json`, without which Bun does not run their install scripts. An install that resolves nothing new does not replay them: if `node_modules/electron/path.txt` is empty, the binary is missing, and it is put back with

```bash
cd apps/desktop && node node_modules/electron/install.js
```

## Build

```bash
bun run build        # typecheck and bundle, no packaging
bun run build:mac    # .dmg arm64 and x64
bun run build:linux  # AppImage and .deb
bun run build:win    # NSIS installer
```

Each system is built on itself: `node-pty` does not compile for another. A release builds the three on its runners (`.github/workflows/release.yml`, see [`docs/monorepo.md`](../../docs/monorepo.md#what-each-release-does)). The main process is compiled to V8 bytecode, which requires the Electron binary at build time. Without a signing identity in reach, electron-builder says so and produces an unsigned artifact, which is what a build on the workstation wants.

## Test

```bash
bun run test      # main process and stores, against the fake agent's transcripts
bun run test:e2e  # builds, then drives the real window through Playwright, never showing it
```

The dashboard screenshots (`e2e/references/*-darwin.png`) are only compared on macOS and are regenerated on purpose, diff reviewed: `bunx playwright test e2e/themes.spec.ts --update-snapshots`. The tolerance (`threshold: 0.05`, `maxDiffPixelRatio: 0.0003`) absorbs glyph rendering after an Electron upgrade, not a screen change. CI does not run the e2e suite: it is run on the owner's machine before a pull request.
