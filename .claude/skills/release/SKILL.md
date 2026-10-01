---
name: release
description: "Ship a Pupitre version — `scripts/release.sh` on the owner's Mac: next version, changelog entry drafted by `claude -p` and reviewed, commit and `vX.Y.Z` tag; then `release.yml` on GitHub: agent and app built on the three systems, macOS notarization, Ed25519 signature of all artifacts, publication to the R2 buckets, declaration to the platform as `stable`, verification from the outside, then the `staging` → `main` pull request opened and merged by the same run — which deploys the site and the console; `promote.yml` to roll back, app ↔ agent compatibility sheet. Use when the owner asks for a release, a fix to publish, or when the release pipeline is touched. Says clearly what does not exist yet."
---

# Shipping a version

A release delivers two artifacts: the desktop app (macOS, Windows, Linux) and the `pupitred` agent (`linux/amd64`, `linux/arm64`). Both ship on the **same tag** `vX.Y.Z`, because the protocol ties them together and the compatibility sheet is read with their two numbers.

The owner's Mac writes the version and the notes and places the tag, through `scripts/release.sh`, without any secret; the tag makes `.github/workflows/release.yml` build, publish and verify the version, one runner per system, then the same run opens the `staging` → `main` pull request and merges it. The release is made from **`staging`** and ships straight to `stable` on production, `app.pupitre.studio`: there is no online staging, everything is tried locally beforehand. The push to `main` is what deploys the site and the console. See [`docs/monorepo.md`](../../../docs/monorepo.md#branches).

## Governed files

| File | Role | Exists? |
| --- | --- | --- |
| `scripts/release.sh` | the Mac's part: `next`, `resolve`, `notes` — stops there so the notes are read — then `check` and `ship` when run again | yes |
| `.github/workflows/release.yml` | the runners' part, on the tag: `ci.yml` first, then `agent build`, `agent publish`, then `desktop` on the Blacksmith runners `blacksmith-6vcpu-macos-15`, `blacksmith-4vcpu-windows-2025`, `blacksmith-4vcpu-ubuntu-2404`, then `app publish`, `verify`, `github-release` and `merge` | yes |
| `.github/workflows/promote.yml` | by hand, `gh workflow run promote.yml -f version=X.Y.Z`: puts a published version back into a channel — the rollback | yes |
| `scripts/release/release.env.tpl` | the 1Password references and the public values — no secret in it; `release secrets` turns it into the repository's secrets, the workflow reads the plain values there | yes |
| `scripts/release/` | **the pipeline itself**: `next`, `resolve`, `notes`, `check`, `ship`, `agent build`, `agent publish`, `desktop`, `app publish`, `verify`, `github-release`, `merge`, `promote`, `secrets` — each step is a `bun scripts/release/index.ts <step>` command, idempotent, driven by the environment, with `--dry-run`; R2 over S3 as the only bus, with a key limited to the two buckets | yes |
| `apps/desktop/package.json` | the app's `version`, `build:mac`, `build:win`, `build:linux` | yes |
| `apps/desktop/electron-builder.yml` | targets, artifact names, what goes in the archive (`out/**` and `package.json`, plus the `dependencies` the main process loads at runtime — everything else is a `devDependency` bundled by Vite), `asarUnpack`, fuses, signing, generic feed | yes |
| `apps/desktop/scripts/release-artefacts.ts` | what an artifact file is, its key in the bucket, the message the release key signs, the rewriting of the feeds — shared by the pipeline and by the app that verifies | yes |
| `apps/agent/package.json` | `release` (`go build -trimpath`, `-X main.version`, injected public key, signature) — no more garble: the source code is public | yes |
| `apps/agent/tools/release` | `keygen`, `public-key`, `sign` — the agent's cryptography, nothing else | yes |
| `packages/shared/src/compat` | the app ↔ agent compatibility sheet | yes |
| `packages/api/src/lib/releases/publish-token.ts` | the token the pipeline presents, and its two-value rotation | yes |
| `apps/site/src/content/changelog/` | one entry per version and per language — the only source of the release notes | yes |
| `scripts/release-notes.ts` | `--check` that a version is covered everywhere, otherwise writes the English entry's body | yes |
| `scripts/assert-branch-writable.ts` | the refusal to commit and push on `main` | yes |
| `docs/monorepo.md` | the branches, and the external dashboards: Apple Developer, Azure Trusted Signing, R2, Cloudflare | yes |
| `docs/deploy.md` | the end-to-end deployment, and the Worker's eleven secrets (plus the four `STRIPE_*` under `BILLING_MODE=stripe`) | yes |
| `docs/contracts/platform-api.md` | `/admin/releases`, `/admin/app-releases`, `/releases/app`, `Release` and `AppRelease` tables | yes |
| `git log <last tag>..staging` | what goes into the version | yes |

## What is still missing

| Piece | State |
| --- | --- |
| Windows signing | the Azure Trusted Signing account does not exist yet: as long as its four `AZURE_SIGNING_*` variables and three `AZURE_*` secrets are missing, a `stable` release would refuse to build Windows; meanwhile, `release.yml`'s `desktop` job sets `PUPITRE_ALLOW_UNSIGNED_WINDOWS: "1"` and Windows ships unsigned (SmartScreen warns on first launch), macOS stays enforced. See `docs/tasks/windows-signing.md` |
| `main`'s branch protection | refused by GitHub Free as long as the organization repository is private; a public repository is entitled to it, and it remains to be set the day it becomes one. The barriers are the local hooks, `release.yml`'s `ci` job on which every build depends, and `merge` which refuses to merge without a green CI on the head commit; a pull request merged by hand is held by nothing |

## Versioning

- A `vX.Y.Z` tag, semver. `Z` for a fix, `Y` for a feature, `X` when the app ↔ agent protocol removes or renames a field.
- The version is that of `apps/desktop/package.json`, which `next` writes; `check` refuses to continue if the changelog does not cover it in both languages, and the agent receives it at build time through `-X main.version`.
- The contract's `protocol` integer is independent of the version: it only changes when a field is removed or renamed. On that day — or the day a version can no longer drive the other without the protocol changing, like 1.0 and its privileged session —, a line is added to `packages/shared/src/compat` — the protocol, the first app version and the first agent version of the generation — and `bun run contracts:export` carries it to the agent. The 1.0 line is `{ protocol: 2, app: "1.0.0", agent: "1.0.0" }`; the 2.0 one, `{ protocol: 3, app: "2.0.0", agent: "2.0.0" }`, carries the `entitlement` → `license` renaming: the release that ships it is tagged `--major`, as `2.0.0`, otherwise the sheet designates a version that does not exist.
- **A version that changes the shape of a file placed on a machine carries its migration.** A renamed `install.json` field, a moved `/etc/pupitre/env` key, a `servers.json` field that moves: the entry is in the matching registry before the tag is placed, otherwise the update leaves an agent that misreads what it finds. See the `config-migrations` skill and [`docs/contracts/config-migrations.md`](../../../docs/contracts/config-migrations.md). The configuration revision has its own counter: it follows neither the version nor the `protocol` integer.
- The tag is annotated, placed by `ship` last on the Mac, never rewritten. Its annotation only serves the history: **the release notes are the changelog entry**, read by `app publish`, recorded in `AppRelease`, taken as the pull request body and displayed everywhere else. A release counts as out when its tag is on `origin` — `next` only reads those; a release stopped before that, including after `ship`'s commit and tag when the push was refused, is resumed as is by rerunning `scripts/release.sh`: `next` keeps the version tagged on `HEAD`, `ship` only does the two pushes. Each step is idempotent.

## Procedure

A release is one command, run twice:

```bash
scripts/release.sh            # a fix; --minor for a feature, --major for the protocol, --version=X.Y.Z to name it
```

Before: `staging` up to date, the tree clean, `bun run lint`, `bun run check:types`, `bun run test`, `bun run build` green, and the owner has run the candidate version locally — the dev app on the dev console, the agent on their VPS. `claude` in the PATH; the repository's secrets up to date (`bun scripts/release/index.ts secrets` after any rotation in the note). What the tag pushes is what lands on `main`: nothing unfinished lingers on `staging` at that moment.

### 1. The version and the notes

The first pass does `next` — the next version in `apps/desktop/package.json` — then `resolve`, then `notes`: `claude -p` reads the commits since the last tag, opens the diff when a message does not say the customer effect, and writes the two files `apps/site/src/content/changelog/{en,fr}/X-Y-Z.mdx`. The script **stops** and names the two files.

What an entry says, and what the owner checks when reading it:

- **What changes for the customer**, in their words. A commit `refactor(api): extract the serializer` produces no line; a commit `fix(desktop): the installation no longer loses its terminal` produces one.
- One heading per surface when there is enough: the app, the agent, the platform. Then, if they exist, the **known limitations** — what this version does not do yet, what remains manual.
- The two languages say the same things. The French is not a literal translation, but it says nothing the English leaves out.
- Nothing invented. A commit whose customer effect cannot be told is read in its diff, or not mentioned.

The body of the English entry **is** the release note recorded in `AppRelease.notes`: it ends up on the console's download page and in the app. It is reread for that reader. `bun scripts/release/index.ts notes --again` has it written again.

### 2. Tag, then let the runners build, publish and merge

The second pass is run without a flag: `next` keeps the version the first wrote in the manifest as soon as it exceeds the last tag, and a `--version=` that is not above that tag is refused before anything is written. It verifies (`check`) then `ship`: commit `chore(release): vX.Y.Z`, annotated tag, push of `staging` and of the tag. The tag push starts `release.yml`, whose jobs chain — `gh run watch` follows it from the terminal:

| Step | Does |
| --- | --- |
| `ci` | `ci.yml` called on the tagged commit: gitleaks on `origin/main..HEAD`, migrations, lint, typecheck, tests, build outside desktop. Red, nothing else leaves: no signature, no bucket, no declaration |
| `agent build` | build, signature, binary test — embedded public key, `version` and `hello` on the machine of each architecture — amd64 on the building runner, arm64 on an arm64 runner (`agent smoke`), never under emulation; or resumed from the bucket if the version is already there, because the platform holds the checksums of the first declaration |
| `agent publish` | `agent/<version>/` of the **private** bucket — binaries, `release.json`, `publications.json` — then `POST /admin/releases` to the platform |
| `desktop` | one job per system: macOS signed and notarized in arm64 and x64, Windows signed by Azure Trusted Signing, Linux — in `stable`, a missing signing value stops the job, electron-builder receives `forceCodeSigning`; the agent resumed from the bucket and embedded; installers, blockmaps and feeds under `work/<version>/<system>/` of the private bucket |
| `app publish` | each installer and each macOS update `.zip` signed with the release key — the installed app puts nothing in place without that `.sig`, on the three systems —, files and `.sig` on the **public** bucket, `latest*.yml` feeds rewritten with absolute URLs under `app/<version>/` and `app/<channel>/`, `POST /admin/app-releases` per file — sending its **key** in the bucket, never an address — and the rows kept in `app/<version>/publications.json` |
| `verify` | from the outside: the platform describes the version, each file it names is served whole by the public bucket, the channel's feeds name it and each file they name has its `.sig` — the report is the run's summary |
| `github-release` | once `verify` passed: the GitHub release of the tag, titled by the changelog entry, its English body followed by a table linking every installer the platform describes on `dl.pupitre.studio` — no file attached, the bucket stays the only source; `--latest` in `stable`, `--prerelease` otherwise; a release that already exists is edited, never duplicated |
| `merge` | the `staging` → `main` pull request, body = the English changelog entry; waits up to five minutes for the `CI / Quality` (or `Quality`) check on its head commit and refuses if it failed, is late or is missing — which happens if `staging` moved after the tag —, then merges it with a merge commit (`gh pr merge --merge --match-head-commit`); a pull request left open is resumed, a `main` that already holds the tag has nothing to do. The push to `main` rebuilds the site and the console through Cloudflare Builds; done with `GITHUB_TOKEN`, it starts no workflow, and the pull request's `pull_request` run, for lack of approval, expires at merge as a red cross without a job — it is not the CI |

If the protocol changed, before the second pass: one more line in `packages/shared/src/compat`, then `bun --cwd=packages/shared run contracts:export`, committed beforehand.

A failing job reruns on its own from GitHub (*Re-run failed jobs*) — what is already in the bucket is rewritten identically, what is already declared answers 200, and the merge gets to the end. A `merge` that refuses for lack of a check on `staging`'s head means commits arrived after the tag: the version is published, but `main` waits — the pull request left open is checked by hand (approve its pending run, or open a new one from the owner's account) then merged with a merge commit once green. A version to republish without a new tag: `gh workflow run release.yml --ref vX.Y.Z`. The `merge` job requires the repository to allow GitHub Actions to open pull requests (`docs/deploy.md`, step 8).

### 3 bis. The release key, once and for all

A **single** Ed25519 pair signs all the releases, the agent as well as the app's artifacts, stable over time. Its public half is already in `apps/desktop/src/main/agent-release.ts`; what follows says how it was made, and what must not be redone lightly.

The owner creates it themselves, outside any agent session — the private half must cross neither a transcript nor a file of the repository:

```
cd apps/agent && go run ./tools/release keygen
```

The command writes `public <base64>` and `private <base64>` to standard output, and nowhere else. Then, three gestures:

1. **The private half** goes into the release's 1Password note, field `PUPITRE_RELEASE_PRIVATE_KEY`, from where `release secrets` copies it as a repository secret. It is never written to a file.
2. **The public half** is copied into `AGENT_RELEASE_PUBLIC_KEY` of `apps/desktop/src/main/agent-release.ts`. The test `src/main/__tests__/agent-release.test.ts` verifies it is 32 bytes; it does not pin its value, but changing it repudiates everything published before.
3. **The agent** does not carry it hard-coded: `apps/agent/package.json` injects it at build time through `-X …/selfupdate.releasePublicKey=$(go run ./tools/release public-key)`, which derives it from the private half. Nothing to copy there.

The two halves go together: an app that embeds one public key and an agent built with another refuse every update, without a useful message. If the pair must change one day, the app must know the old **and** the new one while the fleet updates.

### 3. Verify the release

- macOS: the `.dmg` opens on a blank Mac without a Gatekeeper warning; `spctl --assess --type open --context context:primary-signature Pupitre.dmg` accepts.
- Windows: SmartScreen does not block the signed installer, and the installed app's `resources/app-update.yml` carries `publisherName`.
- Agent: `GET /api/v1/releases/agent/X.Y.Z` answers 401 without a token, a signed redirect with one.
- App: `GET /api/v1/releases/app/latest` answers without a session and names the five artifacts; `curl -I https://dl.pupitre.studio/app/X.Y.Z/<file>` answers 200.
- On a reinstalled VPS: the app installs the version's agent, `hello` returns `agent_version: "X.Y.Z"`.
- `main` carries the `release: vX.Y.Z` merge commit, and `pupitre.studio` lists the version.
- Update: the previous app offers and installs the new one; a previous agent is updated by the app's banner.

### 4. Rolling back

The version shipped `stable` in one go. Rolling back means putting the previous one back into the channel:

```bash
gh workflow run promote.yml -f version=X.Y.Z -f channel=stable
```

`promote` changes the agent's channel (`POST /admin/releases/:version/promote`) and the app's (`POST /admin/app-releases/:version/promote`), then copies the version's three `latest*.yml` under `app/stable/`. Nothing is rebuilt or re-signed.

- Agent: agents already updated stay on the new version until a more recent version is published (the agent does not downgrade without an explicit gesture from the owner).
- App: `electron-updater` does not go back down, an already updated app waits for the fixed version.
- The artifacts of a published version are never deleted from the bucket: a link written elsewhere keeps resolving.
- A fix ships on a new tag `vX.Y.Z+1`, never by rewriting the tag.

## What a release does not do

- Commit or push without an explicit request; `--force`; `--no-verify`; `PUPITRE_ALLOW_MAIN=1`. `scripts/release.sh` is the request: its second pass commits, tags and pushes.
- A squash or a rebase on the `staging` → `main` pull request: the version's tag would leave the history.
- A release for a change that touches neither the app nor the agent: the console, the site and the mails go through a `staging` → `main` pull request merged with a merge commit, without a number, and Cloudflare Builds rebuilds the Workers.
- A second build of the same number: the published version is the one the channel designates, a rollback promotes the previous one.
- A secret, a certificate, a password in the repository, a log, a session transcript.
- A publication of the agent anywhere other than the private bucket, through the platform's API.
- A release build on a Mac: `node-pty` does not compile for another system, and Windows and Linux are only built at home.
- A change to `docs/monorepo.md` without changing the dashboard in the same pass, or the reverse.
