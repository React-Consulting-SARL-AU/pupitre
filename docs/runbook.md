# Production runbook

What to look at, in what order, when something breaks at a customer or on the platform. Every command here exists in the repository; a command that changes is fixed here in the same pass. The exact resource names are in [`monorepo.md`](./monorepo.md), the going-live steps in [`deploy.md`](./deploy.md).

## The three places to read

**The admin console**, `app.pupitre.studio/dashboard/admin`: organizations, servers, licences, events (`/dashboard/admin/events`), mailbox. It is the first reading: it asks for nothing more than a team session.

**The database**, when the console does not show what you are looking for. From `apps/web`:

```bash
bun x wrangler d1 execute DB --env production --remote \
  --command 'SELECT "createdAt","action","targetType","targetId","payload" FROM "Event" ORDER BY "createdAt" DESC LIMIT 50'
```

`Event` is the audit log: `action` (`server.enrolled`, `server.exchanged`, `server.suspended`, `subscription.created`, `release.published`…), `targetType` and `targetId`, `organizationId`, `actorUserId`, `payload`. A read query costs nothing; a hand-written write in production is not done — it goes through an API route or a migration.

**The Worker's logs**: Cloudflare dashboard → *Workers* → `ppt-web-production` → *Logs* (observability enabled, 100% sampling, readable stacks), or live from `apps/web`:

```bash
bun x wrangler tail --env production
```

No error goes to a third-party service: what is not in these logs exists nowhere.

**The customer's server**, when it is the one at fault. The customer is root at home; we never connect to it without them. What we have them run:

| Command | What it says |
| --- | --- |
| `sudo pupitred report` | the last installation's report, in JSON: each module, each `failed` or `warned` step with its replay command; an interrupted installation is marked as such there |
| `dev doctor` | tools, services, tmux session and projects, each with its remedy |
| `dev status --json` | the view of the machine that the app reads |
| `sudo tail -n 200 /var/log/pupitre.log` | the agent's log: commands, paths, never a secret |
| `sudo cat /var/lib/pupitre/report.json` | the same report as `pupitred report`, raw |
| `sudo cat /var/lib/pupitre/license.json` | the last licence read: `state`, `valid_until`, `checked_at` (`entitlement.json` on an agent older than 2.0.0, which migration 8 renames) |
| `systemctl status pupitred` · `journalctl -u pupitred -n 200` | the daemon that reads the platform every 30 seconds |
| `sudo pupitred migrate --status` | the configuration revision, what remains due, the backups kept |

`sudo` asks for `dev`'s password since [decision 0015](./decisions/0015-sudo-by-password.md): the customer copies it from the server's sheet in the app. `dev doctor` and `dev status` do not need it.

## An onboarding that dies

The app chains `server` (address, account, key), `inspection`, `agent` (the pushed binary), `catalog`, `config`, `install` (enrolment then modules), `harden`, `done`. Knowing at which step it stopped says almost everything.

1. **Before the agent** — the address does not answer over SSH, the key is refused, the remote account's password is wrong. The app says so under the form; nothing is created either on the server or on the platform.
2. **The agent's binary** — the app downloads it through `GET /api/v1/releases/agent/:version`, which answers 303 to a five-minute signed R2 URL. A failure here is read in the Worker's logs (the route, then R2): a version that `Release` does not hold for this architecture, or an object missing from the `ppt-agent` bucket. On 2026-09-14, it was an R2 400.
3. **Enrolment** — in the database, `server.enrolled` for this server says that the platform issued the enrolment token; `server.exchanged` says that the agent exchanged it for its server token. The first without the second: the agent never reached the platform. On the server, `/etc/pupitre/platform.url` must name `https://app.pupitre.studio`, `journalctl -u pupitred` says why the request fails, and `/etc/pupitre/server.token` does not exist yet. An interrupted enrolment is resumed: rerun the step from the app, or "Rattacher à nouveau ce serveur" on its page.
4. **The modules** — `sudo pupitred report` names the step that fell, its output and its replay command; `/var/log/pupitre.log` has the detail. A failure does not stop the other modules: the report says everything at once. Replaying from the app is safe, the steps are idempotent.
5. **Hardening** — root closes only if a key opens `dev`. If it stops, root stays open and the app says so; the cause is in the report (`harden`). A customer who can no longer reach anything just afterwards: see [fail2ban](#fail2ban-banned-a-customer).

## "Licence requise" that does not go away

The agent goes into restricted mode when it has no server token, when its last licence read is more than seven days old, or when the platform answered `suspended`. Only `hello`, `ping`, `snapshot`, `status`, `diag`, `agent.upgrade`, `agent.migrate`, `enroll` and `platform.sync` answer; nothing that is running stops.

1. **Does the organization fit within its licence?** Console → the organization: its servers occupying a seat against `FREE_SERVERS` plus the seats of its licence. Free up to three servers, it needs nothing; beyond that without a live licence — an expired grant —, the platform returns `grace` for seven days then `suspended`: the team grants or extends a licence (`subscription.granted`, Console → Licences), or the customer deletes servers. An organization suspended or closed by the team is `suspended` whatever it holds.
2. **Is the server suspended or revoked?** Console → Servers: `status` (`grace`, `suspended`, `revoked`) and `suspendedReason`. A server suspended by the team is restored from its sheet (`server.restored`).
3. **Does the agent read the platform?** `sudo cat /var/lib/pupitre/license.json`: an old `checked_at` says the daemon no longer reaches the console — `systemctl status pupitred`, `journalctl -u pupitred`. Without `/etc/pupitre/server.token`, the server never finished its enrolment (step 3 above).
4. **The platform says valid and the app says restricted?** The daemon rereads every 30 seconds; the app can ask for it right away through `platform.sync`, which stays open in restricted mode. If nothing moves, "Rattacher à nouveau ce serveur" re-enrols: a lost or revoked token is repaired this way, without touching what is running.

## A release that fails

`release.yml` chains `ci` → `agent` → `agent-arm64` → `desktop` (macOS, Windows, Linux) → `publish` → `merge`. Nothing is signed without a green CI, and `merge` opens the `staging` → `main` pull request only once the version is downloadable. The complete procedure is the `release` skill.

- **A job that fell on a fluke** (runner, network, slow notarization): *Re-run failed jobs* in GitHub. Each step is idempotent: what is already in the bucket is rewritten identically, what is already declared answers 200.
- **A fix in the chain itself**: commit on `staging`, then `gh workflow run release.yml --ref staging -f version=X.Y.Z`. Rerunning on the tag would replay the broken chain it designates.
- **`merge` refuses** for lack of a green check on `staging`'s head: commits arrived after the tag. The version is published, `main` waits; the pull request left open is checked then merged by hand, as a merge commit.
- **A published version is bad**: nothing is unpublished, we roll back. `gh workflow run promote.yml -f version=<previous> -f channel=stable` puts the previous version back in the channel, agent and app, and points the update feeds at its files. An app already upgraded does not go back down: it waits for the next one.
- **The console or the site broken after the merge**: Cloudflare Builds redeployed on the push to `main`. Back to the Worker's previous version: `bun x wrangler rollback --config apps/web/dist/server/wrangler.json`, or the list of deployments in the dashboard. A D1 migration is not replayed backwards: it is fixed by a following migration.

## A mail that does not arrive

**A mail sent to `@pupitre.studio`** (support, legal…) goes through Email Routing's catch-all rule, which sends it to the Worker's `email` handler; it becomes a `MailMessage` row (`delivery = 'received'`) in a thread of the mailbox.

- Nothing in the mailbox: Cloudflare dashboard → *Email* → *Email Routing* → the zone's activity says whether the message arrived, was rejected, or was handed to the Worker. Handed to the Worker without a row: the Worker's logs. A message above 20 MiB is refused at the door, and the sender is warned.
- Arrived but filed under "Autres": no `MailMailbox` declares this address. Creating the mailbox attaches the threads already received.

**A mail that the platform sends** — sign-in link, alert, team reply — goes out through Cloudflare Email Sending, the `EMAIL` binding. In production, a missing binding makes the send fail instead of writing it to the logs.

- A mailbox reply that breaks stays in the thread, `delivery = 'failed'`, the cause in `error`, with a `reply_failed` activity: `SELECT "createdAt","address","error" FROM "MailMessage" WHERE "delivery" = 'failed' ORDER BY "createdAt" DESC LIMIT 20`.
- A sign-in link that does not arrive has no row in the database: the Worker's logs, then Email Sending's activity in the dashboard, then the customer's junk folder.

## fail2ban banned a customer

Hardening sets up an `sshd` jail (`/etc/fail2ban/jail.d/pupitre.local`): five failures in ten minutes ban the address for an hour, on the SSH port and on 443 when it is open. The symptom on the customer's side: `Connection reset`, `kex_exchange_identification` or a timeout, from that computer only. Often, root attempts after root was closed, or a tool presenting another key in a loop.

- Wait the hour, or lift the ban from another address or from the host's console:

```bash
sudo fail2ban-client status sshd
sudo fail2ban-client set sshd unbanip <address>
```

- Then find what fails: `journalctl -u ssh -n 100` on the server, and the host the tool targets on the computer — it must go through the app's SSH configuration (`ssh <server name>` once the `Include` line is set), not through `root@`.

## The lost sudo password

`dev`'s password lives in the keychain of the computer that generated it ([decision 0015](./decisions/0015-sudo-by-password.md)); the server has only its hash, and the platform nothing.

- **Another of the customer's computers still holds it**: they copy it from the server's sheet, and it is entered on the one that no longer has it ("Saisir le mot de passe sudo de dev").
- **No computer holds it any more**: without it, no privileged gesture goes through, and rerunning hardening is one. From the host's console, as root: `passwd dev`, then this password is entered in the app. Rerunning hardening from the app afterwards generates a new one and keeps it in the keychain: a replayed `harden.sudo` changes only the password.

The team can do nothing in the customer's place: that is the intended property.

## All devices lost

Since [decision 0014](./decisions/0014-keys-approved-by-a-device.md), a key enters a server only approved by a device that is already on it. When none remains, the platform cannot add one, and neither can the team.

1. On the new computer: install the app, sign in. The device is added to the account (recent sign-in, passkey or second factor included, and an email goes out). Its public key is `keys/device.pub` in the app's data folder.
2. From the host's console, as root:

```bash
pupitred keys reset --key "<OpenSSH public key>"
# or
pupitred keys reset --key /path/to/device.pub
```

The managed `authorized_keys` block and the signers then hold only this key. `keys reset` refuses outside root.

3. In the app, add the server by its address: onboarding takes this device back and places its key again through `keys.trust`. The customer's other devices are then approved from this one.

Removing a lost device from the account, in the console, removes its key from all servers — except where it would be the last in the block, which the agent never empties.
