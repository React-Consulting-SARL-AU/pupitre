# apps/desktop — Guidelines

The Electron app. Monorepo → [`../../CLAUDE.md`](../../CLAUDE.md) · internals → [`docs/desktop.md`](../../docs/desktop.md) · protocol → [`docs/contracts/agent-protocol.md`](../../docs/contracts/agent-protocol.md) · migrations → [`docs/contracts/config-migrations.md`](../../docs/contracts/config-migrations.md) · design → [`DESIGN.md`](../../docs/product/DESIGN.md) · building a screen → `desktop-screens` skill.

> Style is enforced by Ultracite (Biome). This file only contains what the linter does not derive.

## Mandatory stack

Electron 44 · electron-vite (bytecode on the main process only, the preload stays JavaScript) · React 19 · Tailwind 4 on the `@pupitre/design` tokens · Base UI + shadcn/ui, `render` prop, never `asChild` · Zustand · xterm + node-pty · the system's `ssh`, never a JavaScript SSH library · Lucide only.

**Banned**: `@radix-ui/*`, `ssh2`, `node-ssh`, `axios`, any hard-coded colour.

## What the app never does

- It has no second model: it displays what `snapshot` returns. New information appears in the agent first.
- The renderer does not touch the system: `contextIsolation` on, `nodeIntegration` off, explicit surface in `src/preload`. It names a server, a project, an action; the main process validates the name against what the agent has just given.
- Never one `ssh` per call: one client per server (`agent-client.ts`), five channels — control, work, beat (`agentPoll`), follow (journals) on `sudo -n pupitred serve`, and privileged, opened on demand with the sudo password for what `requiresPrivilege` designates. → [channels](../../docs/desktop.md#the-channels-to-the-agent)
- Never `~/.ssh/config` rewritten: the SSH config is the app's own (`userData/ssh/config`, `-F`), shared through an `Include` line on an explicit gesture. → [SSH](../../docs/desktop.md#ssh-configuration-keys-sharing)
- Never a secret in a store, a log, a command or a command line: the protocol's secret stream, `SSH_ASKPASS` for a password, forgotten after sending. → [key](../../docs/desktop.md#placing-the-key-on-a-server)
- Never the bearer token outside `safeStorage` nor across the bridge. Without an account, only a development build installs; the build kind follows the platform, not the folder. → [account](../../docs/desktop.md#the-account-and-the-installation)
- Never a heavy file on the agent's channel: `rsync` or `scp` on the app's SSH session, remote path validated by the main process, local path from a dialog box. → [transfers](../../docs/desktop.md#the-transfers)
- Never an app file rewritten without a revision: `servers.json`, `account.json`, `transfers.json`, `forwards.json`, `preferences.json`, `connections/<provider>.json` and `access/<server>.json` go through `versionedFile()` of `store-migrations.ts`, each with its registry (`servers-migrations.ts`, `account-migrations.ts`, `transfers-migrations.ts`, `forwards-migrations.ts`, `preferences-migrations.ts`, `connections-migrations.ts`, `access-migrations.ts`), one numbered entry per change of shape. → [files](../../docs/desktop.md#the-files-the-app-keeps)
- Never `upgrade` of the modules before `agent.upgrade`, channel closing, `agent.migrate`. → [update](../../docs/desktop.md#updating-the-agent)
- Never an onboarding screen that acts in a `useEffect`: `stores/onboarding-machine.ts` decides, the store executes. → [onboarding](../../docs/desktop.md#the-onboarding)
- Never a value that smells like a secret in `trace.ts`. Nothing traced in a packaged build.

## What each screen does

- `Screen` · `Section` · `Panel` · `Fact`; `eyebrow` = the context, `title` = the thing; never a hand-placed card, label or banner.
- Every control comes from `components/ui/` on Base UI: `Select`, `NumberField`, `CheckBox` / `CheckLine`, `Switch` / `SwitchLine`, `RadioGroup` / `Radio` / `RadioLine`, `ModeCards` / `ModeCard`, `Segmented`, `TabBar` / `Tab`, `Details`, `FoldingSection` (a section that folds under its title, for a page read in pieces), `Dialog`, `ConfirmButton` / `ConfirmDialog`, `Menu`, `Tooltip`, `Hint`. Never a hand-written `<select>`, `<details>`, `<input type="checkbox">` or `role="dialog"`. What floats goes through a portal: a test that reads it mounts the component with `__tests__/dom.tsx` (`mount`, `optionsOf`) rather than `renderToStaticMarkup`.
- A form is a series of `Section`s, each on a `Panel inset="lg"`; the fields breathe at `gap-6` inside; preferences are `SwitchLine`s with their consequence in `detail`; settings fit in a column of vertical `Tab`s and a pane.
- Every gesture answers where it was made: an async handler returns its promise, `Button` / `IconButton` / `ConfirmButton` switch to `loading` on their own (`usePending`).
- Every wait says what is happening; every error says the remedy, the agent's `fix` displayed as is; a refused field carries its sentence, `aria-invalid`, `aria-describedby`.
- A button that has only an icon carries a tooltip (`IconButton` sets it, on `ui/tooltip.tsx`); an icon + label button carries none, a bubble that repeats the label is noise. The native `title` is not displayed on macOS.
- A form ends on its button at the foot, active when something has changed.
- No sentence outside `i18n/strings`, `en` and `fr`.
- No description, intro or note that narrates the screen.

## File conventions

- Files `{feature}-{context}-{type}.tsx`; one React component per file outside `components/ui/`; no barrel file; semicolons (`biome.jsonc`).
- `src/main/<subject>.ts` registers the handlers, `<subject>-run.ts` holds the pure flow with its dependencies as parameters.
- One Zustand store per subject, state as a union discriminated by `status`.
- Complete tree → [docs/desktop.md](../../docs/desktop.md#directory-tree).

## Tests

`bun test` for the main process (fake agent, transcripts in `src/main/__tests__/fixtures/`) and the stores (`stubPupitre`); Playwright in `e2e/` with an axe pass on every screen. Assertions in `it()`, `async/await`, no committed `.only`. The suite never shows the window. Details and screenshots → [docs/desktop.md](../../docs/desktop.md#tests).

Green tests are not enough: a screen change is verified in the running app (`bun run dev:desktop`) before being announced.

## Commands

```bash
bun run dev:web           # from the root: the console the app calls in development
bun run dev
bun run dev:desktop:prod  # from the root: the same app, on app.pupitre.studio
bun run build             # typecheck + bundle
bun run build:mac
bun run test
bun run test:e2e
```
