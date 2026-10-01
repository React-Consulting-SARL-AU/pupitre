# A fake VPS in Docker

An Ubuntu 24.04 machine under systemd, reached over SSH on port 2222, standing in for a test VPS.

**It runs on the Mac.** This is the short loop: the container is on the same machine as the app,
reached through `127.0.0.1`, with no local network, no firewall to open and no address that changes from
café to café. The Windows PC keeps a reason to exist — it is `amd64`, the Mac is `arm64` — but it is a
check before a release, not the everyday gesture.

**Root opens with a password**, like a machine you have just rented: the app asks for it once,
places its own key on that session, and everything that follows plays out as on a real VPS. `core.hardening`
is what closes the door again, and it is precisely the step this bench is there to exercise.

The image can also require **nothing at all** — empty `ROOT_PASSWORD`, `PermitEmptyPasswords yes` —, which
is handy for a manual `ssh`. It is not the right setting for onboarding: the app notices that
the machine already opens and therefore does not install its key, so hardening refuses to close root,
for lack of a key that opens `dev`. The password is the default setting for that reason.

**The machine's identity survives a rebuild.** The host keys live on a volume, not in the
image: `docker compose up --build` gives the app back the same server, not a stranger. Only `down -v` makes
a new machine — and the app will then ask to confirm the reinstallation, which is the right gesture.

## On the MacBook

You need a container runtime. **OrbStack** is the lightest on an Apple silicon Mac and provides
`docker` and `docker compose`:

```bash
brew install --cask orbstack
```

Docker Desktop does the same thing, only heavier. Then, from the repository:

```bash
cd apps/agent/test/vps
docker compose up -d --build
```

That is all: port `2222` answers on `127.0.0.1`, there is no firewall rule to set and no address to
look up.

## From the desktop app

Add the server with the host `127.0.0.1`, port `2222` and account `root`. The app asks for the
password — `pupitre` — once, places its key, and carries on.

## On the Windows PC, for amd64

Docker Desktop installed, WSL2 backend.

1. Copy this folder to the PC.
2. In the folder, in PowerShell:

   ```powershell
   docker compose up -d --build
   ```

3. Open the port on the local network, in an administrator PowerShell, once and for all:

   ```powershell
   New-NetFirewallRule -DisplayName "Pupitre test VPS" -Direction Inbound -Protocol TCP -LocalPort 2222 -Action Allow -Profile Private
   ```

   The Wi-Fi network's profile must be `Private`: `Get-NetConnectionProfile`.

4. Look up the PC's local address: `ipconfig` → "IPv4 Address" of the adapter in use, and give it to
   the app in place of `127.0.0.1`.

## If the app says "answers, but it is not an SSH access"

The port accepts the connection and cuts it immediately: it is Docker's proxy answering, with nothing
behind it. So `sshd` is not running in the container. What says so:

```bash
docker compose exec vps systemctl status ssh.service --no-pager
ssh -p 2222 root@127.0.0.1 true          # "Connection reset" when nothing is listening
```

The image runs `sshd` as a regular service rather than through socket activation, precisely for this
reason: `ssh.socket` did not come up in this container, and nothing said so. An inactive `ssh.service`
after an `up` is the sign that a rebuild is needed — `docker compose up -d --build`.

## From the terminal

To push a development binary or run the integration tests, a key avoids retyping the
password for every command. Declare yours at build time:

```bash
export PUPITRE_VPS_KEY="$(cat ~/.ssh/id_ed25519.pub)"
docker compose up -d --build
```

Then, on the Mac:

```bash
export VPS=root@127.0.0.1
ssh -p 2222 $VPS true                 # answers without asking for anything

bun --cwd=apps/agent run build:dev:linux-arm64
ssh -p 2222 $VPS 'install -m 755 /dev/stdin /usr/local/bin/pupitred' < apps/agent/dist/dev/pupitred-linux-arm64
ssh -p 2222 $VPS pupitred install --only=runtime.node,ai.claude
```

The `dev` build embeds a licence: no token and no platform. On the PC, `build:dev` and
`pupitred-linux-amd64`, with the address you looked up in place of `127.0.0.1`.

Integration tests:

```bash
PUPITRE_STAGING_HOST="root@127.0.0.1" go test -tags staging ./test/staging/...
```

The harness calls `ssh` without `-p`: declare the port in `~/.ssh/config`.

```sshconfig
Host 127.0.0.1
  Port 2222
  User root
```

## A machine that requires nothing

For a manual `ssh`, the image can open without a key or a password:

```bash
docker compose build --build-arg ROOT_PASSWORD=
docker compose up -d
```

`sshd` then hands the empty password to PAM, which only accepts it if `pam_unix` carries `nullok` —
the image puts it there, and two commands say so:

```bash
docker compose exec vps sshd -T | grep -i permitemptypasswords   # must say yes
docker compose exec vps grep nullok /etc/pam.d/common-auth       # must answer
```

Not to be used for onboarding: the app sees a machine that already opens, therefore does not install its
key, and hardening then refuses to close root for lack of a key that opens `dev`.

## The architecture

A Mac tests `arm64`, never `amd64`. A module that downloads one binary per architecture — mise,
Claude Code, the editors — is therefore only exercised for one of the two in the short loop. The Windows
PC settles the other, and the `amd64` staging VPS settles it before a release.

## The probe must see a blank machine

Two details would make it conclude "server already in use", and neither says anything about the real server:

- `/var/lib/docker` convinces it that Docker is there. Hence the absence of a named volume on that path.
- The `ubuntu:24.04` image ships an `ubuntu` account at UID 1000, which it counts as a non-system account. Hence the `userdel`.

If the verdict stays `in_use`, `pupitred probe` on the machine says what it saw.

## Reset

Two gestures, and they do not say the same thing to the app.

```bash
docker compose down            # the machine starts from zero, with the same identity
docker compose up -d --build
```

```bash
docker compose down -v         # another machine: new host keys
docker compose up -d --build
```

After the second, the app refuses the connection — it had pinned the fingerprint of the previous one, and
cannot tell a reinstallation from someone answering in its place. Settings › Servers,
with this server active: the banner compares the two fingerprints, and **"I reinstalled this server"**
pins the new one again. That is the intended behaviour; the first gesture avoids going through it every time.

## What this machine does not reproduce

- `create-swap` fails — no swap in a container. The step settles for a warning.
- `ufw` and `fail2ban` install, but filter the container's network, not that of a real VPS.
- The kernel is that of the virtual machine carrying Docker — WSL2 on the PC, the OrbStack or Docker Desktop VM on the Mac — and it is shared: `sysctl` applies to all of it.
- No public address: outbound Cloudflare tunnels work, exposure through public DNS does not.
- Restarting the machine is `docker compose restart`, not a real `reboot`.
- The `runtime.docker` module installs, but its storage falls back to `vfs`: the kernel refuses overlay2 on top of the container's overlay. Slow, and nothing like a real VPS.
- `runtime.rust` fails: `/tmp` is mounted `noexec` (the container's tmpfs), and `rustup-init` extracts into `/tmp` and then runs from there. A real VPS has an executable `/tmp` and installs it without a hitch.
- `db.*` all at once saturates the `vfs` storage (30 min, apt failures under contention) whereas each database installs just fine on its own; the ten-project `snapshot` exceeds its 300 ms budget by a few milliseconds, the cost of OrbStack's virtualization. Both pass on a real VPS.

For what this list covers, a real staging VPS remains the judge.
