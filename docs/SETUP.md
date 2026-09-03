# Setting up your own server, from A to Z

This walks through the whole thing: renting a machine, making an SSH key, putting
the stack on it, and driving it from Pupitre. No prior knowledge of the project
is assumed.

Total time: about 30 minutes, of which 15 to 25 are the server installing things
on its own.

**Everything except steps 1 to 5 is optional.** The app can drive a plain SSH
host with none of the stack on it; the stack works with no tunnel, no database
and no secret manager. Read the steps you want and skip the rest — each one says
what you lose by skipping it.

---

## Contents

1. [The machine](#1-the-machine)
2. [Your SSH key](#2-your-ssh-key)
3. [First contact](#3-first-contact)
4. [Getting the stack onto the server](#4-getting-the-stack-onto-the-server)
5. [Configuring it](#5-configuring-it)
6. [Running the installation](#6-running-the-installation)
7. [Your own machine](#7-your-own-machine)
8. [Connecting Pupitre](#8-connecting-pupitre)
9. [Your first project](#9-your-first-project)
10. [Optional: public URLs](#10-optional-public-urls)
11. [Optional: a database](#11-optional-a-database)
12. [Optional: a secret manager](#12-optional-a-secret-manager)
13. [Keeping it up to date](#13-keeping-it-up-to-date)
14. [Starting over, or leaving](#14-starting-over-or-leaving)

---

## 1. The machine

### Which distribution

**Ubuntu 24.04 LTS, server edition, x86-64.** That is what the installation
script targets and what it is tested on.

| Distribution | State |
|---|---|
| Ubuntu 24.04 LTS | recommended — tested |
| Ubuntu 22.04 LTS | works; some packages are older |
| Debian 12 / 13 | works; MySQL comes from Oracle's repository instead of the distribution's, and the script says so |
| Anything else (Fedora, Arch, Alpine, RHEL) | not supported — the script uses `apt` and `dpkg` throughout |

Pick the plain **server** image, not a "cloud image" variant or a
provider-preinstalled panel: those come with their own conflicting packages.

Ask for **amd64 / x86-64** if you have the choice. arm64 works, but the headless
Chrome used by the screenshot gallery comes from the distribution there rather
than from Google's package, which the script handles but does not test as much.

### How much machine

| | RAM | Disk | Notes |
|---|---|---|---|
| Minimum | 4 GB | 20 GB | the script refuses less; enough for a couple of Node projects |
| Comfortable | 8–16 GB | 40 GB | several web projects and an AI agent at once |
| A JVM in the mix | 16–32 GB | 60 GB | a Gradle daemon plus an IDE backend is 2 to 4 GB on its own |

CPU matters less than you would think for web dev, and a lot for compiling. If
you will be building a large JVM or Rust project, prefer few fast cores over
many slow ones.

Disk fills up faster than expected: package caches, Gradle, Bun and the
node_modules of every project.

### Where

Any provider that gives you a plain VPS with root SSH access works — Hetzner,
netcup, OVH, Scaleway, DigitalOcean, Vultr, Linode, Contabo, a machine in your
own rack. There is nothing provider-specific in this project.

Two things to check when ordering:

- **Root SSH access**, by password or by a key you upload. Providers that only
  give you a web console make step 3 painful.
- **A public IPv4 address.** IPv6-only works if your own connection has IPv6,
  but that is a bet on every network you will ever work from.

At the end of the order you will have: an **IP address**, a **username**
(usually `root`) and either a **password** or the key you uploaded. That is all
you need.

---

## 2. Your SSH key

The whole setup authenticates with keys and never with passwords. If you already
have a key you use daily, skip to step 3 — you do not need a new one.

### Do you already have one?

```bash
ls -l ~/.ssh/id_ed25519.pub ~/.ssh/id_rsa.pub 2>/dev/null
```

Anything listed is an existing key. Use it.

### Making one

**macOS and Linux:**

```bash
ssh-keygen -t ed25519 -C "$(whoami)@$(hostname -s)"
```

**Windows**, in PowerShell (OpenSSH ships with Windows 10 and 11):

```powershell
ssh-keygen -t ed25519 -C "$env:USERNAME@$env:COMPUTERNAME"
```

Press Enter at every prompt to accept the default location. When it asks for a
passphrase: **use one**. It encrypts the key on disk, and your system's agent
will remember it after the first unlock, so you type it roughly once per session.

That produces two files:

| File | What it is | Who may see it |
|---|---|---|
| `~/.ssh/id_ed25519` | the **private** key | nobody, ever. It does not leave your machine |
| `~/.ssh/id_ed25519.pub` | the **public** key | anyone. This is what you put on servers |

Read the public one — this single line is what you will paste in step 5:

```bash
cat ~/.ssh/id_ed25519.pub
# ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... you@your-machine
```

> **The mistake to avoid.** `SSH_PUBLIC_KEY` in the configuration wants that
> one-line `ssh-ed25519 AAAA…` string. If what you are pasting starts with
> `-----BEGIN OPENSSH PRIVATE KEY-----`, you have the wrong file — and
> `push-secrets.sh` refuses to send it, on purpose.

### If your key lives in a password manager

1Password, and others, can hold the private key and present it through an SSH
agent, so it never touches your disk. That works here, and `setup-mac.sh` detects
1Password's agent automatically. You still need the **public** half in `~/.ssh`:
in 1Password, open the SSH item → *Copy public key* → then

```bash
pbpaste > ~/.ssh/dev-vps.pub      # macOS
```

---

## 3. First contact

Put your public key on the server so you can stop using the password.

**If the provider let you upload the key when ordering**, this is already done —
check it and move on:

```bash
ssh root@203.0.113.10 'hostname'
```

**Otherwise**, with the root password the provider gave you:

```bash
ssh-copy-id -i ~/.ssh/id_ed25519.pub root@203.0.113.10
```

It asks for the root password one last time. Then verify:

```bash
ssh root@203.0.113.10 'hostname'
```

Two things that go wrong here:

- **`ssh-copy-id: ERROR: failed to open ID file`** — your private key is in a
  password manager and not on disk, so `ssh-copy-id` refuses to install the
  public half. Add `-f` to make it stop checking:
  `ssh-copy-id -f -i ~/.ssh/dev-vps.pub root@203.0.113.10`
- **No `ssh-copy-id` on Windows.** Paste it by hand:
  ```powershell
  type $env:USERPROFILE\.ssh\id_ed25519.pub | ssh root@203.0.113.10 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
  ```

Replace `203.0.113.10` with your own address everywhere from here on.

---

## 4. Getting the stack onto the server

Clone this repository on **your own machine** first — that is where you will
edit the configuration:

```bash
git clone https://github.com/<owner>/pupitre.git
cd pupitre
```

Then copy the server half up:

```bash
scp -r server root@203.0.113.10:/opt/dev-stack
```

Only `server/` goes to the server. The app stays on your machine.

---

## 5. Configuring it

One file holds everything the server needs to know. You fill it in **locally**,
where you have a real editor, and one command sends it.

```bash
cd server/mac
./push-secrets.sh --edit --host 203.0.113.10
```

That copies `env.example` to `mac/secrets.env` — which is gitignored and never
leaves your machine except towards your server — and opens it.

### The only thing you must fill in

```bash
SSH_PUBLIC_KEY="ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAI... you@your-machine"
```

Paste the output of `cat ~/.ssh/id_ed25519.pub`, on one line. Without it you
cannot log in as the `dev` user the script creates, and the installation says so
before doing anything.

### What is worth filling in

```bash
STACK_NAME="my server"          # how it introduces itself, instead of a hostname of digits
PROJECTS_DIR=/home/dev/projects # where your projects will live
TZ=Europe/Paris                 # the machine's timezone
GIT_USER_NAME="Your Name"       # the identity of commits made on the server
GIT_USER_EMAIL="you@example.org"
```

### What you can leave alone

Everything else. The five `*_PROVIDER` / `*_ENGINE` settings default to `auto`,
which means "work it out from what is filled in":

| Left empty | What happens |
|---|---|
| `CLOUDFLARE_*` | no tunnel, no public URLs. Projects are reached on their port through the SSH tunnel — see step 10 to add it later |
| `MYSQL_APP_PASSWORD` | no database installed. Projects point at their own — see step 11 |
| `OP_SERVICE_ACCOUNT_TOKEN` | no secret manager. `.env.local` files fall back on each repository's `.env.example` — see step 12 |
| `GITHUB_TOKEN` | no host account. Public repositories clone fine; private ones use the SSH key the server generates, which you add to your account |
| `NEON_API_KEY` | no remote database branches |
| `CLAUDE_CODE_OAUTH_TOKEN` | Claude Code is installed but not signed in. You can sign in from inside a session later |

None of them being filled in is a perfectly normal, working machine. It just
does less.

### Send it

```bash
./push-secrets.sh --host 203.0.113.10
```

It checks the key looks like a public key, refuses outright if you pasted a
private one, and installs the file as `/etc/dev-stack.env` with mode 600, owned
by root.

---

## 6. Running the installation

First, check without installing anything. This makes a real call to every API
whose token you filled in: an invalid Cloudflare token or a wrong zone shows up
in five seconds instead of at minute 18.

```bash
ssh root@203.0.113.10 '/opt/dev-stack/bootstrap.sh --check'
```

Fix whatever it names, then:

```bash
ssh root@203.0.113.10 'cd /opt/dev-stack && chmod +x bootstrap.sh bin/* && ./bootstrap.sh'
```

15 to 25 minutes. It prints each of its twelve steps as it goes.

### Reading the report

A step that fails **does not stop the rest**. At the end you get one report:
what runs, what failed, and the exact command to replay each failure.

```bash
sudo /opt/dev-stack/bootstrap.sh --only=database   # replay one step
sudo /opt/dev-stack/bootstrap.sh --list            # the twelve step names
sudo /opt/dev-stack/bootstrap.sh                   # rerun everything, skipping what is done
```

The script is idempotent — rerunning it is always safe.

### What just happened

| Step | What it did |
|---|---|
| system | packages, 8 GB swap, raised inotify limits |
| user | created `dev`, authorised your key, gave it passwordless sudo |
| runtimes | Node, Bun, pnpm and Java through `mise` |
| database | MySQL or MariaDB, if you asked for one |
| secrets | git identity, an SSH key for the server, the CLI of whatever you configured |
| tunnel | Cloudflare Tunnel and its DNS records, if you asked for one |
| gallery | the screenshot gallery and the `shot` command |
| agents | Claude Code and Codex, plus their machine context |
| skills | the agent skills, in `~/.agents/skills` |
| projects | cloned your projects and installed their dependencies |
| tooling | the `dev` command, `dev-tui`, tmux and zsh configuration |
| harden | firewall on port 22 only, root SSH forbidden, keys only |

> **After the last step, root can no longer log in over SSH.** That is intended.
> From now on you connect as `dev@203.0.113.10`. The script only closes root
> once it has verified your key really does authorise `dev` — you cannot lock
> yourself out.

To update `/opt/dev-stack` from then on, either use `deploy.sh` (step 13) or:

```bash
scp bootstrap.sh dev@203.0.113.10:~/
ssh dev@203.0.113.10 'sudo install -m 755 ~/bootstrap.sh /opt/dev-stack/'
```

---

## 7. Your own machine

Pupitre talks to your server through your system's SSH configuration. It stores
no password and no key of its own — so the one thing to set up is an SSH host.

### On macOS

```bash
cd server/mac
./setup-mac.sh --host 203.0.113.10
```

It writes a `Host dev-vps` block into `~/.ssh/config`, detects 1Password's SSH
agent if you use it, adds shell aliases (`vps`, `dev`, `tui`, `vclaude`…),
installs the Ghostty terminfo on the server if you use Ghostty, and remembers
your server in `~/.dev-stack/target.env` so a rerun does not ask again.

### On Linux or Windows

There is no script — there is nothing worth scripting. Add this to
`~/.ssh/config` (`C:\Users\you\.ssh\config` on Windows):

```
Host dev-vps
    HostName 203.0.113.10
    User dev
    IdentityFile ~/.ssh/id_ed25519
    ConnectTimeout 10
    ServerAliveInterval 30
    ServerAliveCountMax 6
    # Multiplexing: every command after the first is instant, which matters a
    # lot when the app polls and an agent chains dozens of remote calls.
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 10m
    # The database, brought back to 127.0.0.1:3307 on this machine. Harmless if
    # the server has no database.
    LocalForward 3307 127.0.0.1:3306
```

On Windows, drop the two `Control*` lines and `ControlPersist`: OpenSSH for
Windows does not implement multiplexing. Everything works, each call is just
slower.

Check it:

```bash
ssh dev-vps 'dev status'
```

---

## 8. Connecting Pupitre

```bash
cd app
npm install     # or bun install / pnpm install
npm run dev
```

Node 20 or later, and any one of npm, pnpm or bun.

Then, in the app: **Settings → Servers**, pick `dev-vps` in the *SSH host* list —
it reads them from your `~/.ssh/config` — and **Save**.

If it does not connect, the first screen names the failing check and the command
that fixes it. The four checks, in the order they get fixed:

| Check | What it runs |
|---|---|
| the host is declared | `ssh -G dev-vps` |
| the agent answers | `ssh-add -l` |
| the server accepts the key | `ssh -o BatchMode=yes dev-vps true` |
| the connection is reused | `ssh -O check dev-vps` |

**Settings → Servers → Advanced** holds what differs from one machine to another:
the name of the admin command, where the logs are, which editor opens a remote
folder. The defaults describe this stack — you only come here for a server that
is set up differently.

### Building an installable app

```bash
npm run build:mac      # .dmg, arm64 and x64
npm run build:linux    # AppImage + .deb
npm run build:win      # NSIS installer
```

Each has to be built on its own platform: the app embeds a native module
(`node-pty`) that the target platform has to compile.

---

## 9. Your first project

A project is one line in the registry. The columns are documented at the top of
`server/projects.conf`; the short version is:

```
name|dir|repo|pkgmgr|host|port|sub|cmd|install
```

The last field is optional. Left out, the install command is derived from the
package manager — and either way, the app shows you which command it will run.

### From the app

**Settings → Projects → Add**, or the **Configure** button on a project's page.
Fill in the name, the folder, the repository, the port and the start command. The
*Install command* field shows what you would get by default as its placeholder.

### From a terminal

Which is also how an AI agent on the server can register a project that then
appears in the app with nothing more to do:

```bash
echo 'my-site|my-site|https://github.com/me/my-site|bun|127.0.0.1|3000|my-site|bun run dev --host 127.0.0.1 --port 3000' \
  | dev project add
```

It checks that the name, the port and the subdomain are free, clones the
repository, and regenerates the tunnel if there is one. Then:

```bash
dev install my-site   # dependencies — prints the command it uses
dev up my-site        # start it
dev status            # should read "online"
dev logs my-site -f   # if it does not
```

### Validate one project before adding ten

The most expensive lesson of this whole project: get the full chain working on
the simplest project first. A wrong port or a missing `.env.local` looks exactly
like a broken tunnel until you have one thing that works to compare against.

Three conventions that make every subsequent project need no special handling:

- **Listen on `127.0.0.1`**, with a unique port per service.
- **Serve plain http.** A dev server on https reached over http returns a 502
  with nothing in its own logs — it never saw the request.
- **Pin the port on the command line**, not in the project's config file, so the
  registry stays the only source of truth and your repository is untouched.
  `projects.conf` lists the incantation for Vite, Next, Nuxt, Rails, Django,
  Spring Boot and the rest.

---

## 10. Optional: public URLs

Without this, your projects are reachable on their ports through the SSH tunnel.
That is enough for a browser on your own machine. You want this step when you
need a real HTTPS URL — testing on a phone, a webhook from a third party, showing
something to someone.

The stack implements Cloudflare Tunnel. It needs a domain whose DNS is on
Cloudflare (the free plan is enough), and it opens **no port**: cloudflared makes
an outbound connection and traffic comes back down it.

1. Point a domain at Cloudflare, if it is not already.
2. Create an API token at
   [dash.cloudflare.com/profile/api-tokens](https://dash.cloudflare.com/profile/api-tokens)
   with these permissions:
   - *Account* → **Cloudflare Tunnel** → Edit
   - *Zone* → **DNS** → Edit
   - *Account* → **Access: Apps and Policies** → Edit (only if you want step 10b)
3. Copy your **Account ID** and **Zone ID** from the zone's overview page,
   bottom right.
4. Fill them in and send:

```bash
cd server/mac
./push-secrets.sh --edit
#   DEV_DOMAIN="dev.example.org"
#   CLOUDFLARE_API_TOKEN="..."
#   CLOUDFLARE_ACCOUNT_ID="..."
#   CLOUDFLARE_ZONE_ID="..."
./push-secrets.sh
ssh dev-vps 'sudo /opt/dev-stack/bootstrap.sh --only=tunnel'
```

Every project whose `sub` column is not `-` now answers at
`https://<sub>.dev.example.org`.

Keep subdomains to **one single level** (`my-site`, not `my-site.dev`): that is
what a free wildcard certificate covers.

### 10b. Closing the screenshot gallery

The gallery is public by default, and it contains screenshots of whatever your
agents were looking at. Restrict it to your own address:

```bash
CLOUDFLARE_ACCESS_EMAIL="you@example.org"
```

Cloudflare Access then asks for a one-time code by email before serving it. Free
up to 50 users.

---

## 11. Optional: a database

Without this, no database engine is installed, and `dev db` says so rather than
failing. Your projects point at whatever they use — a managed service, a
container, another host.

```bash
DATABASE_ENGINE=mysql             # or mariadb
MYSQL_APP_PASSWORD="..."          # what your applications will use
MYSQL_REMOTE_USER="you"           # a named account for your own machine
MYSQL_REMOTE_PASSWORD="..."
MYSQL_DATABASES="app_dev other_dev"
```

```bash
./push-secrets.sh
ssh dev-vps 'sudo /opt/dev-stack/bootstrap.sh --only=database'
```

The engine binds to `127.0.0.1` and the firewall only opens port 22, so it is
reachable from nowhere but the machine itself. From your own machine you go
through the SSH tunnel: the `LocalForward` in your SSH config puts it on
`127.0.0.1:3307`, which is what TablePlus, DBeaver and DataGrip expect.

To load existing data, drop your dumps in `server/db/` and send them:

```bash
cd server/mac
./deploy.sh --db
ssh dev-vps 'sudo /opt/dev-stack/bootstrap.sh --only=database'
```

One database per file, the name taken from the file name
(`dump_shop_202601011200.sql` → database `shop`). `.sql.gz` works. A dump already
imported is never replayed. `server/db/` is gitignored — dumps are heavy and full
of real data.

---

## 12. Optional: a secret manager

Without this, a repository that versions a `.env.1password.tpl` falls back on its
`.env.example`, and you fill in the values by hand once.

The stack implements 1Password. Create a **service account** (not a user
account) at [my.1password.com](https://my.1password.com) → Developer Tools, with
read access to the one vault it needs:

```bash
OP_SERVICE_ACCOUNT_TOKEN="ops_..."
OP_VAULT="Dev"
```

```bash
./push-secrets.sh
ssh dev-vps 'sudo /opt/dev-stack/bootstrap.sh --only=secrets'
```

Then `dev env <project>` generates the project's `.env.local`, and the app's
**Secrets** page shows which keys are set — their state, never their value.

---

## 13. Keeping it up to date

One command from your own machine, after editing anything in `server/`:

```bash
cd server/mac
./deploy.sh                  # sends everything, reinstalls the tooling
./deploy.sh tunnel           # … and replays the tunnel step
./deploy.sh tunnel,projects  # several steps
./deploy.sh skills           # after adding an agent skill
./deploy.sh --all            # replays every step
./deploy.sh --diag           # sends, then prints the diagnosis report
```

It excludes your dumps and `secrets.env`, fixes the remote folder's permissions,
and restores the executable bits.

When something breaks and nothing explains it, one command produces everything
needed to understand it without access to the machine — service states, the
tunnel's real identity, DNS against that identity, listening ports, an HTTP test
of every origin. No secret is printed:

```bash
ssh dev-vps dev-diag
```

Day-to-day, `dev doctor` is the quick version, and `dev tui` is the full-screen
dashboard.

---

## 14. Starting over, or leaving

Nothing that matters lives on this machine: the code is in git, managed databases
at their host, secrets in your secret manager. Only the local database and the
caches are local.

```bash
ssh dev-vps 'dev db dump'
scp dev-vps:~/dumps/*.sql ./
# on the new machine: steps 3 to 6, then dev db import
```

Reprovisioning takes the same quarter of an hour as the first time.

If you are abandoning the setup, revoke the credentials rather than trusting the
machine is gone: the secret-manager service account, the tunnel in Cloudflare
Zero Trust, and the server's key on your repository host. Three clicks.

---

## Where to go next

- [`server/README.md`](../server/README.md) — what the stack does, day-to-day
  commands, the dashboard, and a long troubleshooting table.
- [`app/README.md`](../app/README.md) — how the app works, what it deliberately
  does not assume, and the contract between the two halves.
- `server/projects.conf` — every registry column, documented in place, with
  worked examples for Node, JVM, Python, PHP and Go projects.
