# The desktop app, from the inside

What the main process of `apps/desktop` does and why. The one-line rules are in [`apps/desktop/CLAUDE.md`](../apps/desktop/CLAUDE.md); this document holds the walkthroughs they summarize. The protocol is in [`contracts/agent-protocol.md`](./contracts/agent-protocol.md), the migrations in [`contracts/config-migrations.md`](./contracts/config-migrations.md), the design in [`product/DESIGN.md`](./product/DESIGN.md).

## The channels to the agent

`src/main/agent-client.ts` holds, per server, SSH sessions that launch `pupitred serve`; requests are serialized, with an increasing `id`. Five channels — four on the session that sudo opens without a password, one privileged:

- **control**: the gestures.
- **work**: long commands and bounded reads (`project.sync`, `fs.read`, `shots.read`).
- **beat**: the reads a screen makes on a timer (`agentPoll`: `snapshot`, `processes.list`), so that a click never waits behind the dashboard's read.
- **follow**: followed logs (`project.logs`, `service.logs`), which hold their channel as long as the reader stays — a service's panel shows its log next to the form, and the `install` that applies the form must not wait for the reader to close the panel. Lines go through `lib/journal-buffer.ts`, which holds them like a terminal — carriage return, cursor moved up, line erase — instead of gluing each Gradle redraw end to end, and `ui/journal-pane.tsx` draws them: clickable addresses, the agent's `=== pupitre up|down … ===` marks rendered as rules, tail-following dropped as soon as you scroll up or put the pointer down to select.
- **privileged**: what the contract reserves for `pupitred serve --privileged` (`requiresPrivilege` in `@pupitre/shared/agent-protocol`: `install`, `harden`, `service.secret`, `backup.*` that write, `enroll`, `keys.trust`…), opened on demand and closed after a minute without use. As `dev`, it launches `privilegedServeAs` and writes the sudo password that `sudo-held.ts` keeps on the first line of standard input, where `sudo -S` reads it — the shell reads it in its place under the earlier rule; as root, plain `pupitred serve --privileged`. A second sudo prompt (`pupitre-sudo:`) on the error output is the password being refused: the channel cuts off, answers `privilege_required` (`refusal.sudo.refused`, or `refusal.sudo.absent` with no password on this computer) and does not retry it until `resetPrivileged` has released it. See [two sessions](./contracts/agent-protocol.md#two-sessions-passwordless-and-privileged).

Never an `ssh` per call. A channel that drops during `install`, `upgrade` or `harden` reopens for as long as the command had time, and the agent's report — written before each step — is reread until `finished_at`; a channel that the app closed itself does not reopen.

The renderer names protocol commands on `agent:call`; `src/main/agent-bridge.ts` lets through only those in `BRIDGE_COMMANDS`, with parameters of the contract's shape, to a known server and a service the agent has just listed. A dedicated IPC channel exists only when the main adds or withholds something: a secret, a token, a local path, an `ssh`, a file. The servers' and terminals' channels go through `handle` and `listen` in `ipc.ts`: they answer only to the top frame of the page the app serves, and to arguments of the expected shape (`shape` in `ipc-guard.ts`) — the rest is rejected before the handler runs. Agent results that become a command line or a local path (`agent.open`, `db.shell`, `completions`, `project.list`, `fs.stat`) are weighed against the contract in every build, and refused (`refusal.agent.shape`) when they lack its shape.

## SSH: configuration, keys, sharing

The SSH configuration is the app's: `userData/ssh/config` passed with `-F`, keys in `userData/keys/` in 0600, pinned host key. The file names the key and the `known_hosts` through `~/.pupitre/<folder>` — a symbolic link (a junction on Windows) to the data folder, set at each write — because `~/Library/Application Support` carries a space and JetBrains Gateway, which reads this file with its own parser, splits `IdentityFile` and `UserKnownHostsFile` on the space, quoted or not. A granted server arrives with its fingerprint and nothing in the `known_hosts`: `hostKey()` writes there the key the machine presents when it is the pin's.

The user's `~/.ssh/config` is never rewritten. On an explicit gesture (Réglages › SSH, or an "Ouvrir dans" button that asks for it first), `ssh-share.ts` places a single `Include` line in it pointing to the app's file, at the top, and removes it the same way. Each of the app's blocks carries `pupitre-<id>` and, when no system host takes it, the server's SSH name (`slug` in `servers.json`, `ssh atelier`): a word chosen by the reader when adding and editable from the server's sheet, derived from the name when nothing is typed, refused when another machine already answers to it (`sshNameFree`); the editors' links name this word. An existing host can be designated.

## Placing the key on a server

The add form knocks before creating anything (`knock.ts`): does the address speak SSH, and what opens the account — what the computer already holds, a password, or nothing.

The password is asked for there, goes out with the draft, and `server-add-run.ts` creates the key then places it in the same gesture; a refused password creates nothing and returns to the form. `key-install.ts` tries in order: the machine already opens, what the computer already holds opens it, then the remote account's password. The password crosses the bridge once, goes out through the `SSH_ASKPASS` helper — never a command line, never a file — and is forgotten. The `ssh-copy-id` line to paste is returned only when the app cannot do the work.

## The account and the installation

The bearer token lives in `safeStorage` and never crosses the bridge. `src/main/keychain.ts` is the only door to the keychain, for this token as for the connections' tokens: on Linux, without GNOME Keyring or KWallet, Chromium encrypts through `basic_text`, a hard-coded key — the app writes nothing there, keeps the secret until it closes and says so, with the remedy. The server is enrolled with the platform, then the agent's binary is downloaded from it, sum and signature verified, before being pushed: written as is as root on a bare server, entrusted to `sudo -n pupitred binary install`, which verifies the signature again, on a server reached as `dev` (`agent-binary.ts`) — the version and the signature on the first line of standard input, never as arguments; a development agent, with no signature, goes through `binary install --privileged` with the sudo password in front (`pushedInput`). Without an account, only a development build installs. With an account, the app reads `license`, `servers` and `license_grant` from `/me`: the organization enrols with nothing else up to `FREE_SERVERS` servers, beyond that with a licence; a suspended licence keeps the app on the "Licence requise" screen.

Hardening ends on `dev`'s sudo password (decision 0015): `runSecuring` (`harden-run.ts`) chains `harden` then, once the app has reconnected as `dev`, `harden.sudo` (`sudo-run.ts`). The password is generated and hashed as SHA-512 `crypt` in the main (`sudo-password.ts`), the hash goes out on the secrets line, the password goes to the keychain (`sudo-vault.ts`, `userData/sudo/<server>.password`) — or to memory, stated on screen, without a keychain — as soon as the agent has set it. The server's sheet (Réglages › Serveurs) shows it masked, to reveal (`sudo:reveal`) or copy in the main (`sudo:copy`). A computer that does not hold it can make no privileged gesture, rerunning hardening included: the sheet has it entered (`server-sudo-enter-dialog.tsx`, `sudo:enter`), and `enterSudoPassword` keeps it only once a privileged channel has opened with it, on a server whose `snapshot.machine.sudo` is `password`. The dashboard also offers it as long as `snapshot.machine.sudo` is `nopasswd_all` (`lib/server-security.ts`).

A development build talks to the local console — `http://localhost:3000`, the one `bun run dev:web` serves — and a packaged build to `app.pupitre.studio`; `PUPITRE_PLATFORM_URL` points a development build to another platform, never a packaged build, which also ignores `PUPITRE_AGENT_PLATFORM_URL` and `PUPITRE_E2E`: a variable set by anything on the machine sends neither the token nor the enrolment elsewhere. The kind of build (`platform-url.ts`) follows the platform, not the folder: a development build directed at a hosted platform (`bun run dev:desktop:prod` from the root) behaves as production — the account's licence, the named release's agent, no prefilling — in a data folder of its own, `Pupitre Dev (<host>)`.

## Updating the agent

Three gestures, in this order: `agent.upgrade`, closing the channel — the `serve` that answers still holds the old binary, replaced by a `rename` — then `agent.migrate`, and only afterwards `upgrade` on the modules. A server whose configuration is not the shape its agent reads refuses everything else itself; the banner says so and offers only the migration.

## The files the app keeps

`servers.json`, `account.json`, `transfers.json`, `forwards.json` (the local port each forward took last time), `preferences.json` (what the main reads itself), `connections/<provider>.json` (a connection's account and settings, next to its token) and `access/<server>.json` (the access keys this computer generated, sealed by the keychain, and the one it adds to the addresses it opens) go through `versionedFile()` in `store-migrations.ts`, each with its `<store>-migrations.ts` registry: one numbered entry per change of shape, raw JSON in and out, a `<file>.r<revision>` copy before the first change. Each write is stamped, written alongside then renamed. A file that cannot be read is copied to `<file>.corrupt` before anything overwrites it; a file written by a newer version — what a rollback through `promote.yml` leaves — is read and never rewritten: a change holds for the session, and the version that wrote it finds it whole again.

## What remains when the app closes

The last window closed, `Cmd+Q` or a relaunch release everything the app holds on the servers — terminals, channels, forwards (`releaseEverything`, on `window-all-closed` as on `will-quit`). An `ssh -L` forward holds its own connection (`ControlMaster=no`, `ControlPath=none`): on the master session, it would live in the master and keep its local port after the process ended.

## Main-process failures

An exception nothing caught, a rejected promise nobody awaited and a startup that does not complete are written to `userData/logs/main.log`, packaged build included (`app-log.ts`, `failures.ts`): one line per failure, with its stack, passed through the same cleaning as the trace, in 0600, and three generations kept beyond 512 KiB. An exception or a missed startup offers to relaunch the app; a rejected promise is only written. This is the file support asks for ([Troubleshooting](../apps/site/src/content/docs/fr/account/troubleshooting.mdx)).

## The transfers

A heavy file does not go through the agent's channel. `transfers-run.ts` launches one `rsync` per transfer on the app's SSH configuration — hence on the master session, with no second authentication — with `--partial --append-verify --info=progress2`, and `scp` when `rsync` is missing on one side, verified by `sha256`. Two at a time, the others wait; a network cut retries with an increasing delay; what remains to be done is written to `transfers.json` and resumed at launch. The remote path is relative to the agent's root and validated by the main; the local path comes from a dialog or a drop, never from a renderer string.

## The onboarding

The order is a machine, the screens draw. `stores/onboarding-machine.ts` says which step follows which answer and what entering a step triggers; the store runs the effects. No onboarding screen acts in a `useEffect`, and a step is reached only through an event that justifies it.

Entering inspection also asks the platform for the organization's backups (`backupsListed`): when it has some, the agent leads to the "Repartir d'une sauvegarde ?" step rather than to the catalogue. A backup taken (`restored`) opens the catalogue and the configuration on what it held, read by `module.config`; the secrets the machine already holds count as given and are neither asked for again nor regenerated. Going back to the choice abandons the restore (`backup.restore.abort`). After security, a restored machine goes through the "Données" step before being ready.

## Backups

The contract is [`contracts/backups.md`](./contracts/backups.md). The connection to the bucket — given in a server's Backups page, never in Settings — keeps the bucket's settings and the public key in `backup.json`, the secret key in `safeStorage` like any token; the passphrase crosses the bridge once, is derived in the main (`@pupitre/shared/backup/crypto`) and is kept nowhere. A first computer chooses the passphrase; the following ones take the public key and the salt of the last backup that the platform lists. A passphrase generated by the app is saved only once "notée ailleurs" is ticked. Before keeping anything, the main writes then erases a small object `<prefix>/.pupitre-probe-<random>` with a SigV4-signed request (`src/main/s3.ts`, `node:crypto`, verified against AWS's reference example): unknown bucket, missing right to write or erase, wrong identifier or secret key, silent endpoint, shifted clock each have their sentence under the form. The endpoint is accepted only as `https://`. The held connection shows a short fingerprint of the public key (sixteen hexadecimal digits of the recipient's SHA-256), the same on each of the organization's computers.

Restoring goes through `backup:restore-setup` then `backup:restore-data` (`src/main/backups.ts`, walkthrough in `backups-run.ts`): the passphrase is verified on this laptop against the backup's public key before anything goes out, then the S3 key and the derived private key go out on the secrets line. Between the configuration and the data — installation and hardening run between the two — the main holds the private key in memory for this server, and zeroes it once the data has come back or the restore is abandoned; an app relaunched in the meantime asks for the passphrase again. Meanwhile, a connection that this laptop does not have does not block the installation of a restored module: its managed values are already on the machine.

A server's "Sauvegardes" page reads `backup.status`, `backup.contents` and the platform's list. A server where `core.backup` is not yet configured follows a four-step setup there (`backups-setup.tsx`): the bucket — the one this computer already holds, or a new one chosen by provider, R2 asking only for the account identifier and AWS only for the region, tried by the test write alone (`backup:probe`) —, the passphrase, which keeps the connection once passed, the frequency, then the content, and "Activer les sauvegardes" applies the module and launches, if left ticked, a first backup. Once in place, the page shows the state, the destination (this computer's connection, and a warning when the server still backs up to another bucket or for another key, which opens Appliquer), the frequency stated in words with retention translated into time, and the content: each database and each project the server holds, ticked by default; unticking an item adds it to `exclude_databases` or `exclude_projects`, and an exclusion naming a vanished item stays displayed, unticked, rather than being lost — on the same `services` store draft and the same Appliquer as a service's page. The weighing before Appliquer (`install:check`) carries the managed values that the keychain gives without secret or tunnel (`weighedValues`), and a refusal that no field carries is named at the foot of the form, never reduced to a number. The agent then judges the bucket with the secret key it still holds, not the one the installation will carry: its `connection` verdict on a module whose managed values the app supplies is discarded, otherwise changing keys would be refused by the old one. The Destination tab shows what the server holds (bucket, endpoint, key identifier, fingerprint), saves a changed destination on this computer then applies it to the server at once, secret key included, and returns on request this computer's key; "Réinitialiser les sauvegardes" uninstalls `core.backup` from the server — the backups made stay in the bucket and the list — and, ticked by default, also forgets this computer's bucket, then the setup starts over. A `core.backup` service's page points to the Backups page. "Revenir à cette sauvegarde" holds the window in a locked dialog — neither Escape nor the backdrop closes it before the end — and chains, each phase stated: backup of the current state (ticked by default), configuration, installation, choice of the modules the backup does not hold, data, `platform.sync` and a note of the restore on the platform.

## The development trace

`trace.ts` writes what the main process does — each `ssh`, each agent command, each phase of an enrolment — to the main process's output and in the window's console. Nothing in a packaged build; `PUPITRE_TRACE=1` turns it on elsewhere. No value whose name smells of a secret is written there, nor what follows a secret's name in a sentence (`Bearer …`, `password=…`).

## Directory tree

```
src/main/        the main process, one file per subject — agent-client, servers, keys, key-install, ssh-config, host-keys, install, harden, projects, services, terminals, account, connections, platform-client, updater, trace… — and a `<subject>-run.ts` alongside when a long operation has a walkthrough of its own
src/preload/     index.ts — the IPC surface, typed
src/renderer/src/
  components/ui/          Base UI + shadcn, one component per file
  components/shell/       sidebar and its transfers panel, guard screens (first launch, no server, restricted or not-ready server), error boundary
  components/onboarding/  the flow: server · inspection · agent · backup · config · hardening · data · done, and its rail
  components/catalog/     choice of modules and presets
  components/config/      a module's form: fields, secrets, lists, connection block
  components/install/     progress, log, report
  components/connections/ the third-party accounts the app holds for the customer
  components/servers/     add, key, host-key alert, reachability
  components/dashboard/   machine, services, projects
  components/projects/    a project's screen — git, diff, branches, logs, editors — and adding a project
  components/services/    the services screen: configuration, credentials, database, tunnel, removal
  components/terminals/   xterm, tabs, status bars, completion
  components/activity/    sessions and processes
  components/fleet/       the organizations and their servers
  components/shots/       the gallery
  components/backups/     a server's backups: step-by-step setup, state, settings, list, immediate backup, return to a backup
  components/files/       the file browser and the basic editor: a folder's list, breadcrumb, an entry's menu, preview, CodeMirror on the terminal's ANSI palette
  components/updates/     banner and notes for the agent's update, migration of its configuration, module upgrade
  components/account/     sign-in, identity, usage, licence (servers used against the quota, seats granted)
  components/settings/    appearance, connections, terminal, notifications, startup, about (version, channel, app update)
  components/help/        the "Aide" view (bottom of the sidebar): how ssh, Claude Code, Codex and the editors reach the driven server, with its values read from the app's SSH file (`ssh-share:state`) and the snapshot's modules
  stores/                 one Zustand store per subject: servers · snapshot · onboarding and onboarding-machine (the order, pure) · install · harden · sudo-password · inspection · catalog · connections · services · project · project-add · files · transfers · terminals · shots · backups · backup-connection · restore · fleet · account · agent-update · app-update · preferences · reenroll · tunnel · channel · announcements · navigation · locale · theme
  lib/                    pure functions and hooks: format, duration, memory (navigation), completion, terminals, remedy, refusals, roles, use-pending, use-history-shortcuts…
  i18n/strings/           the texts, one file per subject, `en` and `fr`
```

## Tests

`bun test` for the main and the stores (a fake agent that replays transcripts from `src/main/__tests__/fixtures/`, `stubPupitre` for `window.pupitre`). The whole suite runs under a happy-dom document registered by the preload (`src/renderer/src/__tests__/dom-register.ts`, before React and Base UI, which decide at load whether they have a browser; the network and the clocks stay Bun's): a screen is usually read through `renderToStaticMarkup`, and what floats — dialog, a `Select`'s list, menu — is mounted with `mount` and read with `optionsOf` (`__tests__/dom.tsx`), because a portal renders nothing in a string. Playwright for Electron in `e2e/`: the complete onboarding and the configuration against the harness in `e2e/harness/onboarding.ts`, theme captures, and an axe pass on each covered screen (`e2e/harness/accessible.ts`). `src/main/__tests__/ipc-surface.test.ts` verifies that every channel the preload calls is answered by the main and by the harness.

The controls drawn by the app are driven by their role: `getByRole("tab")` for a tab, `getByRole("switch")` for a preference, `getByRole("radio")` for a choice card, `getByRole("alertdialog")` for a confirmation, and `pickOption` / `toggle` from `e2e/harness/controls.ts` for a `Select` and a switch.

The dashboard captures are compared only on macOS, where their references live (`e2e/references/*-darwin.png`); they are regenerated with `bunx playwright test e2e/themes.spec.ts --update-snapshots` when the screen changes on purpose. On Linux, the scenario verifies the theme without an image. The e2e suite never shows the window (`foreground.ts`, `discretion.spec.ts`).
