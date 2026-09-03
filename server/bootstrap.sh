#!/usr/bin/env bash
# =============================================================================
#  bootstrap.sh — a development server, from A to Z.
#
#  Target: a freshly installed Ubuntu 24.04 LTS, run as root.
#
#      sudo ./bootstrap.sh              everything, in order
#      sudo ./bootstrap.sh --check      checks the configuration, installs nothing
#      sudo ./bootstrap.sh --only=database,tunnel
#      sudo ./bootstrap.sh --skip=projects
#      sudo ./bootstrap.sh --list       the list of steps
#
#  THREE PRINCIPLES, learned the hard way:
#
#  1. A failing step NEVER stops the rest. It is recorded, and the final report
#     gives you the exact command to replay it. You see everything that is wrong
#     in one go, not one error every ten minutes.
#
#  2. Everything is checked BEFORE starting: distribution, tokens, network
#     access. An invalid Cloudflare token shows up at second 5, not at step 8.
#
#  3. SSH hardening comes LAST, and only after checking that a key really does
#     authorise the dev user. Impossible to lock yourself out.
#
#  The script is idempotent: rerun it as many times as needed.
# =============================================================================

# Deliberately NO `set -e` and no ERR trap: error handling is explicit, step by
# step. That is what allows the script to go all the way through.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STACK_ENV="/etc/dev-stack.env"
STATE_DIR="/var/lib/dev-stack"
LOG_FILE="/var/log/dev-stack.log"

# --------------------------------------------------------------------------- #
#  Output
# --------------------------------------------------------------------------- #
if [[ -t 2 ]]; then
  R=$'\033[0m'; B=$'\033[1m'; D=$'\033[2m'
  GRN=$'\033[32m'; YLW=$'\033[33m'; RED=$'\033[31m'; CYN=$'\033[36m'
else
  R=""; B=""; D=""; GRN=""; YLW=""; RED=""; CYN=""
fi

log()  { printf '%s\n' "$*" >>"$LOG_FILE"; printf '%s\n' "$*" >&2; }
say()  { printf '%s\n' "$*" >&2; printf '%s\n' "$*" >>"$LOG_FILE"; }
head2(){ say ""; say "${CYN}${B}▸ $*${R}"; }
ok()   { say "  ${GRN}✓${R} $*"; }
skip() { say "  ${D}· $* (already done)${R}"; }
warn() { say "  ${YLW}!${R} $*"; }
bad()  { say "  ${RED}✗${R} $*"; }
note() { say "    ${D}$*${R}"; }

# --------------------------------------------------------------------------- #
#  Entry guardrails
# --------------------------------------------------------------------------- #
mkdir -p "$STATE_DIR" 2>/dev/null
touch "$LOG_FILE" 2>/dev/null
say ""
say "${B}dev-stack${R} ${D}$(date '+%F %T')${R}"

if [[ $EUID -ne 0 ]]; then
  bad "must be run as root:  sudo $0"
  exit 1
fi

# --------------------------------------------------------------------------- #
#  The bare minimum, before anything else.
#
#  A "minimal" server image has no editor, no curl, no jq — yet the preflight
#  checks need them, and you need an editor to fill in the configuration file.
#  So we install them first of all, assuming nothing.
# --------------------------------------------------------------------------- #
# apt refuses to run while another process holds the lock — and
# unattended-upgrades systematically runs at a fresh machine's first boot, for
# several minutes. Without this option, EVERY apt-get in this script fails in
# cascade. With it, they wait.
APT_OPTS=(-o DPkg::Lock::Timeout=600 -o Dpkg::Use-Pty=0)

ESSENTIALS=(ca-certificates curl jq nano ncurses-bin)
need_essentials=()
for e in "${ESSENTIALS[@]}"; do
  case "$e" in
    ca-certificates|ncurses-bin) dpkg -s "$e" &>/dev/null || need_essentials+=("$e") ;;
    *) command -v "$e" >/dev/null 2>&1 || need_essentials+=("$e") ;;
  esac
done
if ((${#need_essentials[@]})); then
  say "  ${D}installing the minimum: ${need_essentials[*]}…${R}"
  export DEBIAN_FRONTEND=noninteractive
  apt-get "${APT_OPTS[@]}" update -qq >>"$LOG_FILE" 2>&1
  if ! apt-get "${APT_OPTS[@]}" install -y -qq "${need_essentials[@]}" >>"$LOG_FILE" 2>&1; then
    # One by one: a single unavailable name must not fail the whole batch.
    for e in "${need_essentials[@]}"; do
      apt-get "${APT_OPTS[@]}" install -y -qq "$e" >>"$LOG_FILE" 2>&1
    done
  fi
  still_missing=()
  for e in curl jq nano; do command -v "$e" >/dev/null 2>&1 || still_missing+=("$e"); done
  if ((${#still_missing[@]})); then
    bad "could not install: ${still_missing[*]}"
    say "    Check network access and the apt repositories, then rerun."
    exit 1
  fi
  ok "minimum installed (${need_essentials[*]})"
fi

# The client's terminal may announce a TERM this machine does not know (Ghostty,
# Kitty…). Without this fallback, any full-screen program refuses to start.
if [[ -n "${TERM:-}" ]] && command -v infocmp >/dev/null 2>&1; then
  infocmp "$TERM" >/dev/null 2>&1 || export TERM=xterm-256color
fi

# The script's folder must stay readable by the dev user.
chmod o+rx,g+rx "$SCRIPT_DIR" 2>/dev/null

PHASES=(system user runtimes database secrets tunnel gallery agents skills projects tooling harden)

ONLY=""; SKIP=""; CHECK_ONLY=0
for a in "$@"; do
  case "$a" in
    --only=*)  ONLY="${a#*=}" ;;
    --skip=*)  SKIP="${a#*=}" ;;
    --check)   CHECK_ONLY=1 ;;
    --list)    printf '%s\n' "${PHASES[@]}"; exit 0 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *)         bad "unknown argument: $a"; exit 1 ;;
  esac
done

wanted() {
  local p="$1"
  if [[ -n "$ONLY" ]]; then [[ ",$ONLY," == *",$p,"* ]]; return $?; fi
  [[ -n "$SKIP" && ",$SKIP," == *",$p,"* ]] && return 1
  return 0
}

# --------------------------------------------------------------------------- #
#  Failure accounting — the heart of how this script behaves
# --------------------------------------------------------------------------- #
declare -a FAILED=()      # "phase|label|replay command"
declare -a WARNED=()

fail() {  # fail <phase> <label> [replay command]
  bad "$2"
  FAILED+=("$1|$2|${3:-sudo $0 --only=$1}")
}
soft() { warn "$2"; WARNED+=("$1|$2"); }

# Runs a command while logging it. Returns its exit code.
sh_log() {
  { printf '\n$ %s\n' "$*" >>"$LOG_FILE"; } 2>/dev/null
  "$@" >>"$LOG_FILE" 2>&1
}
sh_quiet() { "$@" >>"$LOG_FILE" 2>&1; }

# --------------------------------------------------------------------------- #
#  Configuration
# --------------------------------------------------------------------------- #
if [[ ! -f "$STACK_ENV" ]]; then
  if [[ ! -f "$SCRIPT_DIR/env.example" ]]; then
    bad "neither $STACK_ENV nor env.example — incomplete folder"
    exit 1
  fi
  install -m 600 "$SCRIPT_DIR/env.example" "$STACK_ENV"
  say ""
  say "${YLW}${B}First run.${R}"
  say "  $STACK_ENV has been created. Fill it in, then rerun this script."
  say ""
  say "      ${CYN}nano $STACK_ENV${R}"
  say "      ${CYN}sudo $0${R}"
  say ""
  say "  ${D}You can check your configuration without installing anything:${R}"
  say "      ${CYN}sudo $0 --check${R}"
  say ""
  exit 0
fi

chmod 600 "$STACK_ENV"
set -a; source "$STACK_ENV" 2>/dev/null; set +a

: "${DEV_USER:=dev}"
: "${DEV_HOME:=/home/$DEV_USER}"
: "${PROJECTS_DIR:=$DEV_HOME/projects}"
: "${DEV_DOMAIN:=}"
: "${TZ:=UTC}"
: "${NODE_VERSION:=22}"
: "${JAVA_VERSION:=temurin-21}"
: "${SHOTS_DIR:=$DEV_HOME/shots}"
: "${SHOTS_PORT:=8099}"
: "${MYSQL_BUFFER_POOL:=2G}"
: "${MYSQL_REMOTE_USER:=$DEV_USER}"
: "${DEBUG_PORTS:=}"
# A VPS hostname is often a string of digits nobody recognises: this is the name
# the machine carries on screen.
: "${STACK_NAME:=$(hostname -s 2>/dev/null || echo server)}"

# --------------------------------------------------------------------------- #
#  What this particular machine runs
#
#  Nothing is mandatory: no database, no tunnel, no secret manager, no particular
#  repository host. A machine with none of the four is still a machine this
#  script installs and `dev` drives — it simply does fewer things.
#
#  "auto", the default, derives each service from what is filled in: an existing
#  installation therefore keeps exactly the behaviour it had, without a single
#  line to add to $STACK_ENV.
# --------------------------------------------------------------------------- #
: "${DATABASE_ENGINE:=auto}"   # mysql | mariadb | none | auto
: "${TUNNEL_PROVIDER:=auto}"   # cloudflare | none | auto
: "${SECRETS_PROVIDER:=auto}"  # 1password | none | auto
: "${GIT_PROVIDER:=auto}"      # github | git | auto
: "${NEON_ENABLED:=auto}"      # yes | no | auto
# The host whose signature has to be known in order to clone over SSH. Empty:
# derived from the registry's URLs, which are the only honest source on this.
: "${GIT_HOST:=}"

if [[ "$DATABASE_ENGINE" == auto ]]; then
  if [[ -n "${MYSQL_APP_PASSWORD:-}" ]]; then
    DATABASE_ENGINE=mysql
    dpkg -s mariadb-server &>/dev/null && DATABASE_ENGINE=mariadb
  else
    DATABASE_ENGINE=none
  fi
fi
if [[ "$TUNNEL_PROVIDER" == auto ]]; then
  if [[ -n "${CLOUDFLARE_API_TOKEN:-}" && -n "${CLOUDFLARE_ACCOUNT_ID:-}" && -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
    TUNNEL_PROVIDER=cloudflare
  else
    TUNNEL_PROVIDER=none
  fi
fi
if [[ "$SECRETS_PROVIDER" == auto ]]; then
  [[ -n "${OP_SERVICE_ACCOUNT_TOKEN:-}" ]] && SECRETS_PROVIDER=1password || SECRETS_PROVIDER=none
fi
if [[ "$GIT_PROVIDER" == auto ]]; then
  [[ -n "${GITHUB_TOKEN:-}" ]] && GIT_PROVIDER=github || GIT_PROVIDER=git
fi
if [[ "$NEON_ENABLED" == auto ]]; then
  [[ -n "${NEON_API_KEY:-}" ]] && NEON_ENABLED=yes || NEON_ENABLED=no
fi

with_database() { [[ "$DATABASE_ENGINE"  != none ]]; }
with_tunnel()   { [[ "$TUNNEL_PROVIDER"  != none ]]; }
with_secrets()  { [[ "$SECRETS_PROVIDER" != none ]]; }
with_github()   { [[ "$GIT_PROVIDER"     == github ]]; }
with_neon()     { [[ "$NEON_ENABLED"     == yes  ]]; }

# The services Pupitre will display: "key:label:systemd-unit".
#
# The default list only contains what this script installs. A machine that runs
# something else — a Redis, a Postgres, a queue — declares it in STACK_SERVICES,
# and Pupitre displays it without knowing anything more.
declared_services() {
  if [[ -n "${STACK_SERVICES:-}" ]]; then printf '%s' "$STACK_SERVICES"; return; fi
  local list=""
  with_tunnel && list="tunnel:Tunnel:cloudflared"
  case "$DATABASE_ENGINE" in
    mysql)   list="${list:+$list }database:Database:mysql" ;;
    mariadb) list="${list:+$list }database:Database:mariadb" ;;
  esac
  printf '%s' "$list"
}

# The repository hosts, so only what actually serves goes into known_hosts.
git_hosts() {
  local hosts="" h
  [[ -n "$GIT_HOST" ]] && hosts="$GIT_HOST"
  with_github && hosts="${hosts:+$hosts }github.com"
  while IFS='|' read -r _ _ repo _ _ _ _ _; do
    case "$repo" in
      git@*)     h="${repo#git@}"; h="${h%%:*}" ;;
      ssh://*)   h="${repo#ssh://}"; h="${h#*@}"; h="${h%%[:/]*}" ;;
      *)         continue ;;
    esac
    [[ -n "$h" && " $hosts " != *" $h "* ]] && hosts="${hosts:+$hosts }$h"
  done < <(registry)
  printf '%s' "$hosts"
}

# Runs a command as the dev user, with a complete and predictable environment:
# neither root's working directory, nor the startup files (Ubuntu's .bashrc exits
# immediately when the shell is not interactive).
as_dev() {
  sudo -u "$DEV_USER" -H bash -c '
    cd "$HOME" 2>/dev/null || exit 1
    export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$HOME/.bun/bin:$PATH"
    export MISE_YES=1
    export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
    [[ -f "$HOME/.config/dev-stack.env" ]] && source "$HOME/.config/dev-stack.env"
    '"$*"
}
as_dev_log() { as_dev "$*" >>"$LOG_FILE" 2>&1; }

# The effective registry: the repository's file, then the projects added on the
# machine (by Pupitre or by an agent). The second wins on equal names, and
# deployment never overwrites it.
PROJECTS_LOCAL=/etc/dev-stack.projects.local.conf
registry() {
  cat "$SCRIPT_DIR/projects.conf" "$PROJECTS_LOCAL" 2>/dev/null | awk -F'|' '
    /^[[:space:]]*(#|$)/ { next }
    NF < 8 { next }
    { if (!($1 in seen)) { seen[$1] = 1; order[++n] = $1 } row[$1] = $0 }
    END { for (i = 1; i <= n; i++) print row[order[i]] }'
}

# How a project's dependencies get installed: the registry's column 9 when it is
# filled in, derived from the package manager otherwise. `dev` derives it the
# same way — the two have to agree, or a project would install differently
# depending on who asked.
install_command() {
  local pkg="$1" explicit="${2:-}"
  if [[ -n "$explicit" && "$explicit" != "-" ]]; then
    printf '%s' "$explicit"
    return
  fi
  case "$pkg" in
    bun)    printf 'bun install' ;;
    pnpm)   printf 'pnpm install' ;;
    npm)    printf 'npm install' ;;
    yarn)   printf 'yarn install' ;;
    # `--version` is the install step for Gradle: it is what downloads the
    # distribution the wrapper pins. Compiling is the project's business, and a
    # full build here would add minutes to the provisioning of every machine.
    gradle) printf './gradlew --version' ;;
    *)      printf '' ;;
  esac
}

# =============================================================================
#  STEP 0 — Preflight checks
#  Everything that can be known in advance is checked here, so that an invalid
#  token is not discovered after twenty minutes of installation.
# =============================================================================
preflight() {
  head2 "Checks"
  local blockers=0

  # --- Distribution ---------------------------------------------------------
  local distro="" version=""
  if [[ -r /etc/os-release ]]; then
    distro="$(. /etc/os-release && echo "$ID")"
    version="$(. /etc/os-release && echo "$VERSION_ID")"
  fi
  case "$distro" in
    ubuntu) ok "Ubuntu $version" ;;
    debian) warn "Debian $version — supported, but MySQL will come from the Oracle repository" ;;
    *)      bad "distribution \"$distro\" not supported (Ubuntu 24.04 recommended)"
            blockers=$((blockers+1)) ;;
  esac

  # --- Resources ------------------------------------------------------------
  local ram_gb disk_gb
  ram_gb=$(free -g | awk '/^Mem:/{print $2}')
  disk_gb=$(df -BG --output=avail / | tail -1 | tr -dc '0-9')
  if (( ram_gb < 4 ));  then bad "not enough RAM: ${ram_gb} GB (8 minimum for anything but the smallest projects)"; blockers=$((blockers+1))
  elif (( ram_gb < 8 )); then warn "RAM: ${ram_gb} GB — tight as soon as a JVM or several watchers run"
  else ok "RAM: ${ram_gb} GB · free disk: ${disk_gb} GB"; fi
  (( disk_gb < 20 )) && { bad "not enough disk: ${disk_gb} GB free"; blockers=$((blockers+1)); }

  # --- Network --------------------------------------------------------------
  # The distribution's repository, not a provider's API: everything else depends
  # on it, and it answers even on a machine that will have no tunnel, no
  # database, and no account anywhere.
  if curl -fsS --max-time 10 -o /dev/null https://archive.ubuntu.com 2>/dev/null \
     || curl -fsS --max-time 10 -o /dev/null https://deb.debian.org 2>/dev/null; then
    ok "outbound Internet access"
  else
    bad "no outbound Internet access — nothing will be installable"
    blockers=$((blockers+1))
  fi

  # --- The machine profile --------------------------------------------------
  # Said before everything else: half the checks that follow only make sense for
  # a service that was actually asked for, and an empty variable is only a fault
  # if something uses it.
  ok "profile: database $DATABASE_ENGINE · tunnel $TUNNEL_PROVIDER · secrets $SECRETS_PROVIDER · repositories $GIT_PROVIDER"

  # --- Configuration file ---------------------------------------------------
  # Only the SSH key is indispensable: without it, nobody gets in.
  local missing=()
  [[ -z "${SSH_PUBLIC_KEY:-}" ]] && missing+=(SSH_PUBLIC_KEY)
  if with_database && [[ -z "${MYSQL_APP_PASSWORD:-}" ]]; then
    missing+=(MYSQL_APP_PASSWORD)
  fi
  if [[ "$TUNNEL_PROVIDER" == cloudflare ]]; then
    [[ -z "${CLOUDFLARE_API_TOKEN:-}"  ]] && missing+=(CLOUDFLARE_API_TOKEN)
    [[ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]] && missing+=(CLOUDFLARE_ACCOUNT_ID)
    [[ -z "${CLOUDFLARE_ZONE_ID:-}"    ]] && missing+=(CLOUDFLARE_ZONE_ID)
    [[ -z "$DEV_DOMAIN"                ]] && missing+=(DEV_DOMAIN)
  fi
  if ((${#missing[@]})); then
    bad "empty variables in $STACK_ENV: ${missing[*]}"
    note "nano $STACK_ENV"
    note "or disable the service that requires them: DATABASE_ENGINE=none, TUNNEL_PROVIDER=none"
    blockers=$((blockers+1))
  fi

  # --- SSH key: format ------------------------------------------------------
  if [[ -n "${SSH_PUBLIC_KEY:-}" ]]; then
    if [[ "$SSH_PUBLIC_KEY" =~ ^(ssh-ed25519|ssh-rsa|ecdsa-sha2)[[:space:]] ]]; then
      ok "SSH public key well formed"
    else
      bad "SSH_PUBLIC_KEY does not look like a public key"
      note "expected: \"ssh-ed25519 AAAA…\" on a single line"
      blockers=$((blockers+1))
    fi
  fi

  # --- Tokens: really tested, and only if they serve ------------------------
  local r
  if [[ "$TUNNEL_PROVIDER" == cloudflare && -n "${CLOUDFLARE_API_TOKEN:-}" ]]; then
    r=$(curl -fsS --max-time 15 https://api.cloudflare.com/client/v4/user/tokens/verify \
          -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null)
    if [[ "$(jq -r '.success // false' <<<"${r:-{\}}")" == "true" ]]; then
      ok "Cloudflare token valid"
      if [[ -n "${CLOUDFLARE_ZONE_ID:-}" ]]; then
        r=$(curl -fsS --max-time 15 "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID" \
              -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" 2>/dev/null)
        if [[ "$(jq -r '.success // false' <<<"${r:-{\}}")" == "true" ]]; then
          ok "zone: $(jq -r '.result.name' <<<"$r")"
        else
          bad "CLOUDFLARE_ZONE_ID refused (or the token has no DNS right on that zone)"
          blockers=$((blockers+1))
        fi
      fi
    else
      bad "invalid Cloudflare token"
      note "required permissions: Account → Cloudflare Tunnel → Edit,  Zone → DNS → Edit"
      blockers=$((blockers+1))
    fi
  fi

  if with_github; then
    r=$(curl -fsS --max-time 15 -H "Authorization: Bearer $GITHUB_TOKEN" \
          https://api.github.com/user 2>/dev/null)
    [[ -n "$(jq -r '.login // empty' <<<"${r:-{\}}")" ]] \
      && ok "GitHub token valid ($(jq -r .login <<<"$r"))" \
      || soft preflight "GitHub token refused — private repositories will not be cloneable"
  else
    # Not a fault: a public repository clones with no account, and a private
    # repository elsewhere than GitHub clones with the server's key.
    ok "repositories: plain git, with no host account"
  fi

  if with_neon; then
    r=$(curl -fsS --max-time 15 -H "Authorization: Bearer $NEON_API_KEY" \
          https://console.neon.tech/api/v2/users/me 2>/dev/null)
    [[ -n "$(jq -r '.id // empty' <<<"${r:-{\}}")" ]] \
      && ok "Neon key valid" \
      || soft preflight "Neon key refused"
  fi

  if with_secrets; then
    [[ "${OP_SERVICE_ACCOUNT_TOKEN:-}" != ops_* ]] \
      && soft preflight "OP_SERVICE_ACCOUNT_TOKEN does not start with \"ops_\" — is that really a service account?"
  fi

  # --- Ports: two projects on the same port is a guaranteed breakdown -------
  local dups
  dups="$(registry | awk -F'|' '$6 ~ /[0-9]+$/ {sub(/^.*:/, "", $6); print $6}' \
          | sort | uniq -d | tr '\n' ' ')"
  if [[ -n "${dups// /}" ]]; then
    bad "duplicate ports in the registry: $dups"
    note "the second project will not be able to start — fix column 6"
    blockers=$((blockers+1))
  else
    ok "port plan consistent ($(registry | wc -l) services)"
  fi

  # --- Subdomains: one single level, and no duplicate -----------------------
  # Without a tunnel the column is ignored: projects are reached on their port,
  # and a duplicate has no consequence.
  local subdups deep
  subdups="$(registry | awk -F'|' '$7!="-" {print $7}' | sort | uniq -d | tr '\n' ' ')"
  deep="$(registry | awk -F'|' '$7!="-" && $7 ~ /\./ {print $7}' | tr '\n' ' ')"
  if with_tunnel; then
    [[ -n "${subdups// /}" ]] && { bad "duplicate subdomains: $subdups"; blockers=$((blockers+1)); }
    [[ -n "${deep// /}" ]] && soft preflight "multi-level subdomains (not covered by a free wildcard certificate): $deep"
  fi

  # --- The occupied /home/dev trap ------------------------------------------
  if [[ -e "$DEV_HOME" && ! -d "$DEV_HOME" ]]; then
    bad "$DEV_HOME is a file, not a folder"
    note "a transfer targeted that path before the user was created:"
    note "  mv $DEV_HOME /root/recovered.dat"
    blockers=$((blockers+1))
  fi

  say ""
  if (( blockers )); then
    say "  ${RED}${B}$blockers blocking point(s).${R} Fix them then rerun."
    say ""
    return 1
  fi
  ok "everything is in order to start"
  return 0
}

# =============================================================================
#  1 — System
# =============================================================================
phase_system() {
  head2 "1/12 — System"
  export DEBIAN_FRONTEND=noninteractive
  timedatectl set-timezone "$TZ" 2>/dev/null

  # A fresh machine often leaves dpkg half-configured (unattended-upgrades
  # interrupted by the first reboot). Until that is repaired, every installation
  # fails.
  sh_quiet dpkg --configure -a
  sh_quiet apt-get "${APT_OPTS[@]}" -f install -y -qq

  if [[ ! -f "$STATE_DIR/apt.done" ]]; then
    sh_quiet apt-get "${APT_OPTS[@]}" update -qq && sh_quiet apt-get "${APT_OPTS[@]}" -y -qq upgrade \
      && { touch "$STATE_DIR/apt.done"; ok "system up to date"; } \
      || soft system "partial apt upgrade — no consequence at this stage"
  else
    skip "apt upgrade"
  fi

  # Installed one by one: an invalid name must not fail the batch.
  local pkgs=(
    build-essential pkg-config ca-certificates curl wget gnupg lsb-release
    git git-lfs zsh tmux nano vim less rsync unzip zip xz-utils
    jq ripgrep fd-find htop ncdu tree direnv netcat-openbsd
    python3 python3-venv ufw fail2ban ncurses-term
  )
  local missing=() failed=()
  for p in "${pkgs[@]}"; do dpkg -s "$p" &>/dev/null || missing+=("$p"); done
  if ((${#missing[@]})); then
    if ! sh_quiet apt-get "${APT_OPTS[@]}" install -y -qq "${missing[@]}"; then
      for p in "${missing[@]}"; do sh_quiet apt-get "${APT_OPTS[@]}" install -y -qq "$p" || failed+=("$p"); done
    fi
    if ((${#failed[@]})); then
      soft system "packages skipped: ${failed[*]}"
      # The cause almost always fits on one line: we surface it rather than
      # leaving you to search a 2000-line log.
      local why
      why="$(apt-get "${APT_OPTS[@]}" install -y -qq "${failed[0]}" 2>&1 | grep -m1 -E '^E:|Unable to locate|Could not get lock' || true)"
      [[ -n "$why" ]] && note "$why"
      note "replay: sudo $0 --only=system"
    else
      ok "${#missing[@]} packages installed"
    fi
  else
    skip "packages"
  fi
  [[ -e /usr/local/bin/fd ]] || ln -sf "$(command -v fdfind 2>/dev/null)" /usr/local/bin/fd 2>/dev/null

  if [[ ! -f /swapfile ]]; then
    if fallocate -l 8G /swapfile 2>/dev/null && chmod 600 /swapfile \
       && sh_quiet mkswap /swapfile && swapon /swapfile 2>/dev/null; then
      grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >>/etc/fstab
      ok "8 GB swap"
    else
      soft system "swap not created"
    fi
  else
    skip "swap"
  fi

  if ! grep -q 'dev-stack' /etc/sysctl.d/99-dev-stack.conf 2>/dev/null; then
    cat >/etc/sysctl.d/99-dev-stack.conf <<'EOF'
# dev-stack: many watchers (Vite, Metro, Gradle) on a single machine
fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=1024
vm.swappiness=10
EOF
    sh_quiet sysctl -p /etc/sysctl.d/99-dev-stack.conf
    ok "system limits raised"
  else
    skip "system limits"
  fi

  # Some repositories freeze a hostname in their package.json. We point it at
  # 127.0.0.1, simply: each project has its own port now, so there is no need for
  # a distinct loopback address per project.
  #
  # The list comes from the registry's host column — nothing is hard-coded, so
  # someone else's projects get the same treatment as ours.
  local hostnames
  hostnames="$(registry | awk -F'|' '$5 ~ /\.localhost$/ {print $5}' | sort -u | tr '\n' ' ')"
  hostnames="${hostnames% }"
  if [[ -n "$hostnames" ]]; then
    if ! grep -q "dev-stack" /etc/hosts; then
      printf '\n# --- dev-stack: hostnames frozen in the repositories'"'"' package.json ---\n127.0.0.1  %s\n' \
        "$hostnames" >>/etc/hosts
      ok "project hostnames → 127.0.0.1 ($hostnames)"
    else
      # The list can grow as projects are added: we rewrite the managed line
      # rather than appending a second block.
      sed -i "s|^127\.0\.0\.1  .*# managed by dev-stack$|127.0.0.1  $hostnames  # managed by dev-stack|" /etc/hosts
      grep -q "# managed by dev-stack" /etc/hosts \
        || printf '127.0.0.1  %s  # managed by dev-stack\n' "$hostnames" >>/etc/hosts
      skip "project hostnames"
    fi
  else
    skip "no .localhost hostname in the registry"
  fi
}

# =============================================================================
#  2 — User  (no hardening here: see step 12)
# =============================================================================
phase_user() {
  head2 "2/12 — User $DEV_USER"

  if ! id "$DEV_USER" &>/dev/null; then
    if sh_quiet adduser --disabled-password --gecos "" "$DEV_USER"; then
      ok "user created"
    else
      fail user "creating the user $DEV_USER"; return 1
    fi
  else
    skip "user"
  fi

  sh_quiet usermod -aG sudo "$DEV_USER"
  echo "$DEV_USER ALL=(ALL) NOPASSWD:ALL" >"/etc/sudoers.d/90-$DEV_USER"
  chmod 440 "/etc/sudoers.d/90-$DEV_USER"
  command -v zsh >/dev/null 2>&1 && sh_quiet chsh -s "$(command -v zsh)" "$DEV_USER"

  # Home folder: present, and above all owned by the user.
  [[ -d "$DEV_HOME" ]] || { mkdir -p "$DEV_HOME"; cp -a /etc/skel/. "$DEV_HOME/" 2>/dev/null; }
  if [[ "$(stat -c '%U' "$DEV_HOME")" != "$DEV_USER" ]]; then
    chown -R "$DEV_USER:$DEV_USER" "$DEV_HOME"; chmod 755 "$DEV_HOME"
    ok "ownership of $DEV_HOME fixed"
  fi
  if ! sudo -u "$DEV_USER" test -w "$DEV_HOME"; then
    fail user "$DEV_USER cannot write in $DEV_HOME"; return 1
  fi
  ok "home folder ready"

  install -d -m 700 -o "$DEV_USER" -g "$DEV_USER" "$DEV_HOME/.ssh"
  install -d -m 700 -o "$DEV_USER" -g "$DEV_USER" "$DEV_HOME/.config"
  if [[ -n "${SSH_PUBLIC_KEY:-}" ]]; then
    local ak="$DEV_HOME/.ssh/authorized_keys"
    touch "$ak"
    grep -qF "$SSH_PUBLIC_KEY" "$ak" || echo "$SSH_PUBLIC_KEY" >>"$ak"
    chown "$DEV_USER:$DEV_USER" "$ak"; chmod 600 "$ak"
    ok "public key authorised for $DEV_USER"
  else
    fail user "SSH_PUBLIC_KEY empty — you will not be able to connect as $DEV_USER"
  fi

  # Environment for non-interactive shells: this file, and only this file, is
  # what `ssh <host> "command"` reads.
  local envf="$DEV_HOME/.config/dev-stack.env"
  : >"$envf"
  # wrangler looks for CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID before any
  # other method. Without them, any project declaring a "remote" binding opens a
  # browser OAuth flow — impossible to finish on a server.
  for v in OP_SERVICE_ACCOUNT_TOKEN OP_VAULT NEON_API_KEY \
           CLAUDE_CODE_OAUTH_TOKEN ANTHROPIC_API_KEY OPENAI_API_KEY \
           CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID; do
    [[ -n "${!v:-}" ]] && printf 'export %s=%q\n' "$v" "${!v}" >>"$envf"
  done
  chown "$DEV_USER:$DEV_USER" "$envf"; chmod 600 "$envf"
  ok "application secrets placed for $DEV_USER"
}

# =============================================================================
#  3 — Runtimes: a single tool, mise, for Node, Bun, pnpm and Java
# =============================================================================
phase_runtimes() {
  head2 "3/12 — Runtimes"

  if ! as_dev 'command -v mise' &>/dev/null; then
    if as_dev_log 'curl -fsSL https://mise.run | MISE_QUIET=1 sh'; then
      ok "mise installed"
    else
      fail runtimes "installing mise"; return 1
    fi
  else
    skip "mise"
  fi

  # .zshenv is the ONLY file zsh reads for a command passed to ssh. Without it,
  # `ssh <host> "bun run build"` answers "command not found".
  cat >"$DEV_HOME/.zshenv" <<'EOF'
# --- dev-stack: read by ALL zsh shells, including `ssh server "cmd"` ---
export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$HOME/.bun/bin:$PATH"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
[[ -r /etc/dev-stack.public.env ]] && source /etc/dev-stack.public.env
[[ -f "$HOME/.config/dev-stack.env" ]] && source "$HOME/.config/dev-stack.env"
[[ -n "$TERM" ]] && ! infocmp "$TERM" &>/dev/null && export TERM=xterm-256color
EOF
  chown "$DEV_USER:$DEV_USER" "$DEV_HOME/.zshenv"
  # Same for bash, at the top of the file: Ubuntu's .bashrc exits before the end
  # when the shell is not interactive.
  if ! grep -q 'dev-stack' "$DEV_HOME/.bashrc" 2>/dev/null; then
    { echo '# --- dev-stack ---'
      echo 'export PATH="$HOME/.local/bin:$HOME/.local/share/mise/shims:$HOME/.bun/bin:$PATH"'
      cat "$DEV_HOME/.bashrc" 2>/dev/null
    } >"$DEV_HOME/.bashrc.tmp" && mv "$DEV_HOME/.bashrc.tmp" "$DEV_HOME/.bashrc"
    chown "$DEV_USER:$DEV_USER" "$DEV_HOME/.bashrc"
  fi
  ok "shell environment written (.zshenv)"

  # A single manager for all four runtimes. Java through mise rather than SDKMAN:
  # one dependency fewer, and no hook depending on the current directory.
  local tool
  for tool in "node@${NODE_VERSION}" "bun@latest" "pnpm@latest" "java@${JAVA_VERSION}"; do
    if as_dev_log "mise use -g -y $tool"; then
      ok "${tool%@*} ${tool#*@}"
    else
      fail runtimes "installing $tool"
    fi
  done

  # JAVA_HOME, resolved once and written down: JVM build tools need it.
  local jhome
  jhome="$(as_dev 'mise where java' 2>/dev/null | tail -1)"
  if [[ -n "$jhome" && -d "$jhome" ]]; then
    grep -q JAVA_HOME "$DEV_HOME/.zshenv" || \
      echo "export JAVA_HOME=\"$jhome\"" >>"$DEV_HOME/.zshenv"
    ok "JAVA_HOME → $jhome"
  else
    soft runtimes "JAVA_HOME not found — to be checked before compiling a JVM project"
  fi

  # Each repository declares its own version in the package.json
  # "packageManager" field. A global pnpm of another version refuses to install.
  # corepack, shipped with Node, resolves the right version per project.
  #
  # corepack reads the "packageManager" field and refuses what it does not know —
  # and several repositories declare "bun@…", which corepack ignores. Enabled
  # globally, it makes pnpm fail on THOSE projects with a message that has no
  # bearing on the problem ("Unsupported package manager specification"). So we
  # enable it for pnpm only, without making it mandatory.
  if as_dev_log 'corepack enable pnpm'; then
    ok "corepack enabled for pnpm — each pnpm repository uses its declared version"
  else
    soft runtimes "corepack unavailable — pnpm will use its global version"
  fi

  install -d -o "$DEV_USER" -g "$DEV_USER" "$DEV_HOME/.gradle"
  if [[ ! -f "$DEV_HOME/.gradle/gradle.properties" ]]; then
    cat >"$DEV_HOME/.gradle/gradle.properties" <<'EOF'
org.gradle.daemon=true
org.gradle.parallel=true
org.gradle.caching=true
EOF
    chown "$DEV_USER:$DEV_USER" "$DEV_HOME/.gradle/gradle.properties"
    ok "Gradle settings"
  fi

  # A real check, not just "the install command returned 0".
  local versions
  versions="$(as_dev 'node -v 2>/dev/null; bun -v 2>/dev/null; pnpm -v 2>/dev/null; java -version 2>&1 | head -1')"
  if [[ $(grep -c . <<<"$versions") -lt 4 ]]; then
    fail runtimes "a runtime is not answering — detail: as_dev 'node -v; bun -v; pnpm -v; java -version'"
    note "$(tr '\n' ' ' <<<"$versions")"
  else
    ok "verified: $(tr '\n' ' ' <<<"$versions")"
  fi
}

# =============================================================================
#  4 — Database
# =============================================================================
phase_database() {
  head2 "4/12 — Database"

  if ! with_database; then
    skip "no database requested (DATABASE_ENGINE=none)"
    note "projects that need one point at their own — a managed service, a remote host, a container"
    return 0
  fi

  # The requested engine drives the installation; the one ALREADY there decides
  # the configuration — the two are not administered the same way.
  local flavour="$DATABASE_ENGINE"
  [[ "$flavour" == mysql || "$flavour" == mariadb ]] || flavour=mysql
  if dpkg -s mysql-server &>/dev/null; then
    flavour=mysql; skip "mysql-server"
  elif dpkg -s mariadb-server &>/dev/null; then
    flavour=mariadb; skip "mariadb-server"
  else
    local distro; distro="$(. /etc/os-release && echo "$ID")"
    if [[ "$distro" == ubuntu ]] && ! apt-cache policy mysql-server 2>/dev/null | grep -q 'Candidate: [0-9]'; then
      sh_quiet add-apt-repository -y universe || \
        echo "deb http://archive.ubuntu.com/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") universe" \
          >/etc/apt/sources.list.d/universe.list
      sh_quiet apt-get "${APT_OPTS[@]}" update -qq
    fi
    if [[ "$DATABASE_ENGINE" == mariadb ]] \
       && sh_quiet env DEBIAN_FRONTEND=noninteractive apt-get "${APT_OPTS[@]}" install -y -qq mariadb-server; then
      flavour=mariadb
      ok "mariadb-server installed"
    elif sh_quiet env DEBIAN_FRONTEND=noninteractive apt-get "${APT_OPTS[@]}" install -y -qq mysql-server; then
      flavour=mysql
      ok "mysql-server installed"
    elif sh_quiet env DEBIAN_FRONTEND=noninteractive apt-get "${APT_OPTS[@]}" install -y -qq mariadb-server; then
      flavour=mariadb
      soft database "MariaDB installed instead of MySQL — compatible with most clients, but it is not the same engine"
    else
      fail database "no database engine installable"; return 1
    fi
  fi

  local svc=mysql
  systemctl list-unit-files 2>/dev/null | grep -q '^mariadb\.service' && svc=mariadb

  install -d -m 755 /etc/mysql/conf.d
  cat >/etc/mysql/conf.d/99-dev-stack.cnf <<EOF
[mysqld]
bind-address                   = 127.0.0.1
max_connections                = 200
innodb_buffer_pool_size        = ${MYSQL_BUFFER_POOL}
innodb_flush_log_at_trx_commit = 2
character-set-server           = utf8mb4
collation-server               = utf8mb4_unicode_ci
local_infile                   = 1
# Without this, a TCP connection from 127.0.0.1 is resolved to "localhost" and
# falls on the socket-only account. This keeps the behaviour deterministic.
skip_name_resolve              = ON
EOF
  [[ "$flavour" == mysql ]] && echo "mysqlx = 0" >>/etc/mysql/conf.d/99-dev-stack.cnf

  if ! sh_quiet systemctl restart "$svc"; then
    fail database "$svc does not restart — journalctl -u $svc -n 40"
    return 1
  fi
  ok "$flavour configured and started"

  # No default database: those created are the ones the machine declares.
  local dbs=(${MYSQL_DATABASES:-})
  if ((${#dbs[@]})); then
    for db in "${dbs[@]}"; do
      sh_quiet mysql -e "CREATE DATABASE IF NOT EXISTS \`$db\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    done
    ok "databases: ${dbs[*]}"
  else
    skip "no database to create (MYSQL_DATABASES empty)"
  fi

  # root@localhost stays on socket authentication: that is what makes
  # `sudo mysql` work, hence `dev db` and dump imports. We do not touch it.
  local auth="caching_sha2_password"
  [[ "$flavour" == mariadb ]] && auth="mysql_native_password"
  if sh_quiet mysql <<SQL
CREATE USER IF NOT EXISTS 'root'@'127.0.0.1' IDENTIFIED WITH ${auth} BY '${MYSQL_APP_PASSWORD}';
ALTER  USER            'root'@'127.0.0.1' IDENTIFIED WITH ${auth} BY '${MYSQL_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
CREATE USER IF NOT EXISTS '${MYSQL_REMOTE_USER}'@'127.0.0.1' IDENTIFIED BY '${MYSQL_REMOTE_PASSWORD:-$MYSQL_APP_PASSWORD}';
ALTER  USER            '${MYSQL_REMOTE_USER}'@'127.0.0.1' IDENTIFIED BY '${MYSQL_REMOTE_PASSWORD:-$MYSQL_APP_PASSWORD}';
GRANT ALL PRIVILEGES ON *.* TO '${MYSQL_REMOTE_USER}'@'127.0.0.1' WITH GRANT OPTION;
FLUSH PRIVILEGES;
SQL
  then
    ok "root@127.0.0.1 for the apps · ${MYSQL_REMOTE_USER}@127.0.0.1 for your workstation"
    ok "root@localhost left on socket auth — sudo mysql works"
  else
    fail database "creating the MySQL accounts"
  fi

  import_dumps
}

# Imports every dump present in db/ — one per database.
#
# The file name gives the database name: "fulldump_shop_… .sql" feeds shop,
# "dump_intranet_… .sql" feeds intranet. .gz files are decompressed on the fly. An
# import already done is never replayed: the marker carries the file name, so a
# newer dump is indeed re-imported.
import_dumps() {
  local dir="${DUMPS_DIR:-$SCRIPT_DIR/db}"
  [[ -d "$dir" ]] || return 0
  shopt -s nullglob
  local f
  for f in "$dir"/*.sql "$dir"/*.sql.gz; do
    local base marker
    base="$(basename "$f")"
    # fulldump_<name>_<timestamp>.sql → <name>
    if [[ "$base" =~ ^(fulldump|dump)_([a-zA-Z0-9_]+)_[0-9]+\.sql(\.gz)?$ ]]; then
      base="${BASH_REMATCH[2]}"
    else
      base="${base%%.*}"
    fi
    marker="$STATE_DIR/dump-$(basename "$f").done"
    [[ -f "$marker" ]] && { skip "dump $(basename "$f")"; continue; }

    sh_quiet mysql -e "CREATE DATABASE IF NOT EXISTS \`$base\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
    say "  ${D}importing $(basename "$f") → $base ($(du -h "$f" | cut -f1), several minutes)…${R}"
    local rc=1
    if [[ "$f" == *.gz ]]; then
      gunzip -c "$f" | mysql "$base" >>"$LOG_FILE" 2>&1 && rc=0
    else
      mysql "$base" <"$f" >>"$LOG_FILE" 2>&1 && rc=0
    fi
    if (( rc == 0 )); then
      touch "$marker"
      ok "$base imported ($(mysql -N -B -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$base'" 2>/dev/null) tables)"
    else
      soft database "import of $(basename "$f") failed — dev db import will replay it"
    fi
  done
  shopt -u nullglob
}

# =============================================================================
#  5 — Secrets and accounts
#
#  Three independent things, each of them optional: a secret manager, an account
#  at a repository host, a remote database provider. A machine with none of them
#  keeps a git identity and an SSH key — that is all `git clone` really needs.
# =============================================================================
phase_secrets() {
  head2 "5/12 — Secrets and accounts"

  # --- 1Password ------------------------------------------------------------
  if ! with_secrets; then
    skip "no secret manager (SECRETS_PROVIDER=none)"
  elif ! command -v op >/dev/null 2>&1; then
    if curl -fsSL https://downloads.1password.com/linux/keys/1password.asc 2>/dev/null \
         | gpg --dearmor -o /usr/share/keyrings/1password.gpg 2>/dev/null; then
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/1password.gpg] https://downloads.1password.com/linux/debian/$(dpkg --print-architecture) stable main" \
        >/etc/apt/sources.list.d/1password.list
      sh_quiet apt-get "${APT_OPTS[@]}" update -qq
      sh_quiet apt-get "${APT_OPTS[@]}" install -y -qq 1password-cli \
        && ok "op installed ($(op --version 2>/dev/null))" \
        || soft secrets "1Password CLI not installed"
    else
      soft secrets "1Password repository key unreachable"
    fi
  else
    skip "op ($(op --version 2>/dev/null))"
  fi
  if with_secrets && command -v op >/dev/null 2>&1; then
    as_dev 'op vault list --format=json' &>/dev/null \
      && ok "1Password authenticated" \
      || soft secrets "op installed but the token does not open the vault"
  fi

  # --- GitHub ---------------------------------------------------------------
  if ! with_github; then
    skip "no repository host account (GIT_PROVIDER=$GIT_PROVIDER)"
  elif ! command -v gh >/dev/null 2>&1; then
    mkdir -p -m 755 /etc/apt/keyrings
    if curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg 2>/dev/null \
         -o /etc/apt/keyrings/githubcli.gpg; then
      chmod go+r /etc/apt/keyrings/githubcli.gpg
      echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli.gpg] https://cli.github.com/packages stable main" \
        >/etc/apt/sources.list.d/github-cli.list
      sh_quiet apt-get "${APT_OPTS[@]}" update -qq
      sh_quiet apt-get "${APT_OPTS[@]}" install -y -qq gh && ok "gh installed" || soft secrets "gh not installed"
    fi
  else
    skip "gh"
  fi

  as_dev "git config --global user.name  '${GIT_USER_NAME:-$DEV_USER}'"
  as_dev "git config --global user.email '${GIT_USER_EMAIL:-$DEV_USER@$(hostname -f 2>/dev/null || hostname)}'"
  as_dev "git config --global init.defaultBranch main"
  as_dev "git config --global pull.rebase true"
  as_dev "git config --global commit.gpgsign false"
  ok "git identity"

  [[ -f "$DEV_HOME/.ssh/id_ed25519" ]] || \
    as_dev_log "ssh-keygen -t ed25519 -N '' -C '$(hostname -s 2>/dev/null || echo dev)' -f \$HOME/.ssh/id_ed25519"
  # The hosts the registry's repositories actually name, plus the one the
  # configuration designates: nothing hard-coded, and nothing useless.
  local host
  for host in $(git_hosts); do
    as_dev_log "ssh-keyscan -t ed25519,rsa '$host' >> \$HOME/.ssh/known_hosts"
  done
  as_dev_log "sort -u -o \$HOME/.ssh/known_hosts \$HOME/.ssh/known_hosts"

  if with_github && command -v gh >/dev/null 2>&1; then
    as_dev "gh auth status" &>/dev/null || as_dev_log "echo '$GITHUB_TOKEN' | gh auth login --with-token"
    as_dev_log "gh auth setup-git"
    local title; title="$(hostname -s 2>/dev/null || echo dev)"
    if ! as_dev "gh ssh-key list" 2>/dev/null | grep -q "$title"; then
      as_dev_log "gh ssh-key add \$HOME/.ssh/id_ed25519.pub --title '$title'" \
        && ok "server key added to GitHub" \
        || soft secrets "key not added to GitHub (admin:public_key scope missing?)"
    else
      skip "key on GitHub"
    fi
    as_dev "gh auth status" &>/dev/null && ok "gh authenticated"
  fi

  # --- Neon -----------------------------------------------------------------
  if ! with_neon; then
    skip "no remote Neon database (NEON_ENABLED=no)"
    return 0
  fi
  if ! as_dev 'command -v neonctl' &>/dev/null; then
    as_dev_log 'bun add -g neonctl' && ok "neonctl installed" \
      || soft secrets "neonctl not installed"
  else
    skip "neonctl"
  fi
  # "Installed" is not enough: repository bootstrap scripts need it to ANSWER.
  # Without that, they conclude "Install neonctl" while it is right there.
  if as_dev 'command -v neonctl' &>/dev/null; then
    if as_dev 'neonctl projects list --output json' &>/dev/null; then
      ok "neonctl authenticated — Neon branches can be created"
    else
      soft secrets "neonctl installed but not answering — invalid NEON_API_KEY?"
      note "projects that provision a Neon branch will fail to generate their .env.local"
    fi
  fi
}

# =============================================================================
#  6 — Tunnel
#
#  Cloudflare is the only provider implemented, and it is optional. Without a
#  tunnel, projects stay reachable on their port, through the SSH tunnel Pupitre
#  already opens — this is a development machine, not a hosting service.
# =============================================================================
phase_tunnel() {
  head2 "6/12 — Tunnel ($TUNNEL_PROVIDER)"

  if ! with_tunnel; then
    skip "no tunnel requested (TUNNEL_PROVIDER=none)"
    note "projects are reached on their port, through ssh -L"
    return 0
  fi

  if ! command -v cloudflared >/dev/null 2>&1; then
    if curl -fsSL https://pkg.cloudflare.com/cloudflare-main.gpg 2>/dev/null \
         -o /usr/share/keyrings/cloudflare-main.gpg; then
      echo "deb [signed-by=/usr/share/keyrings/cloudflare-main.gpg] https://pkg.cloudflare.com/cloudflared any main" \
        >/etc/apt/sources.list.d/cloudflared.list
      sh_quiet apt-get "${APT_OPTS[@]}" update -qq
      sh_quiet apt-get "${APT_OPTS[@]}" install -y -qq cloudflared && ok "cloudflared installed" \
        || { fail tunnel "installing cloudflared"; return 1; }
    else
      fail tunnel "cloudflared repository unreachable"; return 1
    fi
  else
    skip "cloudflared"
  fi

  install -d -m 755 /etc/cloudflared
  local name="${CLOUDFLARE_TUNNEL_NAME:-dev-stack}"
  local cred="/etc/cloudflared/${name}.json" tid=""

  if [[ -f "$cred" ]]; then
    tid="$(jq -r '.TunnelID // empty' "$cred")"
    skip "tunnel \"$name\" (${tid:0:8}…)"
  else
    local secret resp
    secret="$(openssl rand -base64 32)"
    resp="$(curl -fsS -X POST \
      "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" \
      --data "$(jq -nc --arg n "$name" --arg s "$secret" \
        '{name:$n, tunnel_secret:$s, config_src:"local"}')" 2>/dev/null)"
    if [[ "$(jq -r '.success // false' <<<"${resp:-{\}}")" != "true" ]]; then
      # The classic case after a server reinstall: the tunnel still exists on the
      # Cloudflare side, but its secret lived on the old machine — so it is
      # unusable. We delete it to start clean.
      local old_id
      old_id="$(curl -fsS "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel?name=${name}&is_deleted=false" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" 2>/dev/null | jq -r '.result[0].id // empty')"
      if [[ -n "$old_id" ]]; then
        note "tunnel \"$name\" orphaned (${old_id:0:8}…) — deleting"
        sh_quiet curl -fsS -X DELETE \
          "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${old_id}" \
          -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}"
        sleep 2
        resp="$(curl -fsS -X POST \
          "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel" \
          -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" \
          --data "$(jq -nc --arg n "$name" --arg s "$secret" \
            '{name:$n, tunnel_secret:$s, config_src:"local"}')" 2>/dev/null)"
      fi
    fi

    if [[ "$(jq -r '.success // false' <<<"${resp:-{\}}")" == "true" ]]; then
      tid="$(jq -r '.result.id' <<<"$resp")"
      jq -nc --arg a "$CLOUDFLARE_ACCOUNT_ID" --arg t "$tid" --arg s "$secret" \
        '{AccountTag:$a, TunnelID:$t, TunnelSecret:$s}' >"$cred"
      chmod 600 "$cred"
      ok "tunnel \"$name\" created"
    else
      local msg; msg="$(jq -rc '.errors // empty' <<<"${resp:-{\}}")"
      fail tunnel "creating the tunnel: ${msg:-empty response}"
      note "Zero Trust → Networks → Tunnels: delete \"$name\" then rerun"
      return 1
    fi
  fi
  [[ -n "$tid" ]] || { fail tunnel "tunnel identifier not found"; return 1; }

  write_ingress "$tid" "$cred"

  cat >/etc/systemd/system/cloudflared.service <<EOF
[Unit]
Description=Cloudflare Tunnel ($DEV_DOMAIN)
After=network-online.target
Wants=network-online.target

[Service]
Type=notify
ExecStart=/usr/bin/cloudflared --no-autoupdate --config /etc/cloudflared/config.yml tunnel run
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sh_quiet systemctl daemon-reload
  sh_quiet systemctl enable cloudflared
  sh_quiet systemctl restart cloudflared
  sleep 3
  systemctl is-active --quiet cloudflared && ok "cloudflared active" \
    || fail tunnel "cloudflared does not start — journalctl -u cloudflared -n 40"

  # --- DNS ------------------------------------------------------------------
  local created=0 updated=0 dnsfail=0 name_ dir repo pkg host port sub cmd
  while IFS='|' read -r name_ dir repo pkg host port sub cmd; do
    port="${port##*:}"
    [[ -z "$name_" || "$name_" == \#* || "$sub" == "-" || -z "$sub" ]] && continue
    local fqdn="${sub}.${DEV_DOMAIN}" rec rec_id rec_content
    local want="${tid}.cfargotunnel.com"
    rec="$(curl -fsS "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records?name=${fqdn}" \
      -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" 2>/dev/null)"
    rec_id="$(jq -r '.result[0].id // empty' <<<"${rec:-{\}}")"
    rec_content="$(jq -r '.result[0].content // empty' <<<"${rec:-{\}}")"

    if [[ -n "$rec_id" && "$rec_content" == "$want" ]]; then
      continue                       # already correct
    elif [[ -n "$rec_id" ]]; then
      # The record points at an OLD tunnel — that is error 1033 in the browser:
      # DNS answers, but there is no tunnel left behind it.
      if curl -fsS -X PATCH "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records/${rec_id}" \
          -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" \
          --data "$(jq -nc --arg c "$want" '{content:$c, proxied:true, comment:"dev-stack"}')" \
          >>"$LOG_FILE" 2>&1; then
        updated=$((updated+1))
      else
        dnsfail=$((dnsfail+1))
      fi
    elif curl -fsS -X POST "https://api.cloudflare.com/client/v4/zones/${CLOUDFLARE_ZONE_ID}/dns_records" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" \
        --data "$(jq -nc --arg n "$fqdn" --arg c "$want" \
          '{type:"CNAME", name:$n, content:$c, proxied:true, comment:"dev-stack"}')" \
        >>"$LOG_FILE" 2>&1; then
      created=$((created+1))
    else
      dnsfail=$((dnsfail+1))
    fi
  done < <(registry)
  (( dnsfail )) && soft tunnel "$dnsfail DNS record(s) failed"
  (( updated )) && ok "DNS: $updated record(s) redirected to the current tunnel"
  ok "DNS: $created created, $updated updated under $DEV_DOMAIN"
}

# The scheme to use to reach an origin.
#
# A scheme declared in the registry ("https:5180") wins: that is the only recourse
# when the service is stopped at the moment the ingress is written. Otherwise we
# ask the origin — a handful of bytes is enough to tell a TLS answer from a
# cleartext one. Nothing listening: we fall back on http, the convention.
origin_scheme() {
  local host="$1" declared="$2" port="${2##*:}"
  [[ "$declared" == https:* ]] && { echo https; return; }
  [[ "$declared" == http:*  ]] && { echo http;  return; }

  if curl -s -o /dev/null --max-time 3 "http://${host}:${port}/" 2>/dev/null; then
    echo http
  elif curl -sk -o /dev/null --max-time 3 "https://${host}:${port}/" 2>/dev/null; then
    echo https
  else
    echo http
  fi
}

# Generates /etc/cloudflared/config.yml from the registry.
write_ingress() {
  local tid="$1" cred="$2" name_ dir repo pkg host port sub cmd scheme port_raw
  {
    echo "# Generated by bootstrap.sh — source: $SCRIPT_DIR/projects.conf"
    echo "tunnel: $tid"
    echo "credentials-file: $cred"
    echo "originRequest:"
    echo "  connectTimeout: 30s"
    echo "ingress:"
    while IFS='|' read -r name_ dir repo pkg host port sub cmd; do
      [[ -z "$name_" || "$name_" == \#* || "$sub" == "-" || -z "$sub" ]] && continue
      port_raw="$port"
      # The origin's scheme. The convention is http, but a dev server serving TLS
      # and attacked over http gives a 502 without a word in its logs — it never
      # saw the request. We do not want that to happen again, so: the declared
      # scheme ("https:5180") wins if present, and otherwise we ask the origin
      # itself, when it is running.
      port="${port##*:}"
      scheme="$(origin_scheme "$host" "$port_raw")"

      echo "  # $name_"
      echo "  - hostname: ${sub}.${DEV_DOMAIN}"
      echo "    service: ${scheme}://${host}:${port}"
      echo "    originRequest:"
      # Host rewriting: the dev server believes it is answering on its usual
      # local hostname, which neutralises Vite's allowedHosts check without
      # modifying a single vite.config.ts.
      echo "      httpHostHeader: ${host}:${port}"
      # A development certificate is signed by no authority cloudflared knows.
      # Verifying it would add nothing: the origin is on the machine, reachable
      # only from it.
      if [[ "$scheme" == https ]]; then
        echo "      noTLSVerify: true"
      fi
    done < <(registry)
    echo "  - service: http_status:404"
  } >/etc/cloudflared/config.yml
  ok "ingress: $(grep -c 'hostname:' /etc/cloudflared/config.yml) routes"
}

# =============================================================================
#  7 — Screenshot gallery
# =============================================================================
phase_gallery() {
  head2 "7/12 — Screenshot gallery"

  install -d -m 755 -o "$DEV_USER" -g "$DEV_USER" "$SHOTS_DIR"

  # A headless browser for `shot <url>`: the Google deb rather than Ubuntu's
  # chromium package, which is a wrapper around a confined snap.
  if ! command -v google-chrome-stable >/dev/null 2>&1 && ! command -v chromium >/dev/null 2>&1; then
    if [[ "$(dpkg --print-architecture)" == amd64 ]] \
       && curl -fsSL https://dl.google.com/linux/linux_signing_key.pub 2>/dev/null \
         | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg 2>/dev/null; then
      echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] https://dl.google.com/linux/chrome/deb/ stable main" \
        >/etc/apt/sources.list.d/google-chrome.list
      sh_quiet apt-get "${APT_OPTS[@]}" update -qq
      sh_quiet apt-get "${APT_OPTS[@]}" install -y -qq google-chrome-stable && ok "google-chrome installed" \
        || soft gallery "no headless browser — shot <url> unavailable, shot <file> works"
    else
      # arm64 and the rest: chromium from the distribution, which does exist there.
      sh_quiet apt-get "${APT_OPTS[@]}" install -y -qq chromium && ok "chromium installed" \
        || soft gallery "no headless browser — shot <url> unavailable, shot <file> works"
    fi
  else
    skip "headless browser"
  fi

  install -m 755 "$SCRIPT_DIR/bin/dev-shots-server" /usr/local/bin/dev-shots-server 2>/dev/null || {
    soft gallery "bin/dev-shots-server missing from the script folder"; return 0; }

  # The gallery's base URL depends on what the machine has: its public address
  # when there is a tunnel and a domain, its local port otherwise. `shot` prints
  # that URL, and it has to be one that actually answers.
  local shots_base="http://127.0.0.1:${SHOTS_PORT}"
  with_tunnel && [[ -n "$DEV_DOMAIN" ]] && shots_base="https://shots.${DEV_DOMAIN}"

  sed -e "s|@SHOTS_DIR@|$SHOTS_DIR|g" -e "s|@SHOTS_BASE_URL@|$shots_base|g" \
      "$SCRIPT_DIR/bin/shot.in" >/usr/local/bin/shot 2>/dev/null \
    && chmod 755 /usr/local/bin/shot && ok "shot command → $shots_base" \
    || soft gallery "shot command not installed"

  cat >/etc/systemd/system/dev-shots.service <<EOF
[Unit]
Description=Screenshot gallery
After=network.target

[Service]
Environment=SHOTS_DIR=$SHOTS_DIR
Environment=SHOTS_PORT=$SHOTS_PORT
ExecStart=/usr/local/bin/dev-shots-server
User=$DEV_USER
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  sh_quiet systemctl daemon-reload
  sh_quiet systemctl enable dev-shots
  sh_quiet systemctl restart dev-shots
  sleep 1
  systemctl is-active --quiet dev-shots \
    && ok "gallery on $shots_base" \
    || soft gallery "dev-shots does not start — journalctl -u dev-shots -n 20"

  if ! with_tunnel; then
    ok "gallery on http://127.0.0.1:${SHOTS_PORT} — no tunnel, so no exposure"
  elif [[ -n "${CLOUDFLARE_ACCESS_EMAIL:-}" ]]; then
    local fqdn="shots.${DEV_DOMAIN}" app aid
    if ! curl -fsS "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" \
         -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" 2>/dev/null \
         | jq -e --arg d "$fqdn" '.result[]? | select(.domain==$d)' >/dev/null; then
      app="$(curl -fsS -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps" \
        -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" \
        --data "$(jq -nc --arg d "$fqdn" '{name:"Dev shots", domain:$d, type:"self_hosted", session_duration:"168h"}')" 2>/dev/null)"
      aid="$(jq -r '.result.id // empty' <<<"${app:-{\}}")"
      if [[ -n "$aid" ]]; then
        sh_quiet curl -fsS -X POST "https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/access/apps/${aid}/policies" \
          -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" -H "Content-Type: application/json" \
          --data "$(jq -nc --arg e "$CLOUDFLARE_ACCESS_EMAIL" '{name:"Owner", decision:"allow", include:[{email:{email:$e}}]}')"
        ok "gallery protected by Cloudflare Access ($CLOUDFLARE_ACCESS_EMAIL)"
      else
        soft gallery "Access not configured (\"Access: Apps and Policies\" permission missing?)"
      fi
    else
      skip "Access protection"
    fi
  else
    soft gallery "gallery is PUBLIC — set CLOUDFLARE_ACCESS_EMAIL to close it"
  fi
}

# =============================================================================
#  8 — AI agents
# =============================================================================
phase_agents() {
  head2 "8/12 — AI agents"

  if ! as_dev 'command -v claude' &>/dev/null; then
    as_dev_log 'curl -fsSL https://claude.ai/install.sh | bash' \
      || as_dev_log 'bun add -g @anthropic-ai/claude-code'
    as_dev 'command -v claude' &>/dev/null && ok "claude code installed" \
      || soft agents "claude code not installed"
  else
    skip "claude code"
  fi

  if ! as_dev 'command -v codex' &>/dev/null; then
    as_dev_log 'bun add -g @openai/codex' || as_dev_log 'npm install -g @openai/codex'
    as_dev 'command -v codex' &>/dev/null && ok "codex installed" \
      || soft agents "codex not installed — no consequence if you use Claude Code"
  else
    skip "codex"
  fi

  # The same context for both agents: Claude reads it in CLAUDE.md, Codex in
  # AGENTS.md. The repository's code preferences are appended as they are; the
  # skills are laid down by the next step.
  install -d -o "$DEV_USER" -g "$DEV_USER" "$DEV_HOME/.claude" "$DEV_HOME/.codex"
  local context
  context="$(mktemp)"
  cat >"$context" <<EOF
# Machine context — remote development server

- This machine is a Linux server, NOT a workstation. No Xcode, no iOS simulator,
  no desktop app build here.
- Projects live in $PROJECTS_DIR. Shell: zsh.
- Before writing a command, check the package.json scripts.
- Drive the servers with \`dev\` (dev up / down / logs / status), never with a
  hand-launched \`bun run dev\`: that duplicates processes and blocks ports.
- Secrets come from the machine's secret manager, never from a committed file.

## The skills

They live in ~/.agents/skills, and cover what keeps coming up:

- \`server-dev\` — register, start, diagnose a project with \`dev\`.
- \`capture\` — show an image: \`shot\` prints a public URL, and the answer ends
  with that URL embedded, never with a local path nobody can open from here.
- \`ship\`, \`branch\`, \`pr\` — commit, push, open a pull request, in the
  repository's own convention.
EOF
  if [[ -f "$SCRIPT_DIR/agents/preferences.md" ]]; then
    { echo; cat "$SCRIPT_DIR/agents/preferences.md"; } >>"$context"
  fi
  install -m 644 -o "$DEV_USER" -g "$DEV_USER" "$context" "$DEV_HOME/.claude/CLAUDE.md"
  install -m 644 -o "$DEV_USER" -g "$DEV_USER" "$context" "$DEV_HOME/.codex/AGENTS.md"
  rm -f "$context"

  ok "machine context written for Claude (CLAUDE.md) and Codex (AGENTS.md)"
}

# =============================================================================
#  9 — Agent skills
# =============================================================================
# A single folder is authoritative, ~/.agents/skills: Codex reads it as is, and
# Claude Code finds one symlink per skill in ~/.claude/skills. The repository's
# skills (agents/skills) are copied there; third-party skills
# (agents/external-skills.conf) are installed there by `npx skills`, which files
# them in the same place.
phase_skills() {
  head2 "9/12 — Agent skills"

  local canon="$DEV_HOME/.agents/skills" links="$DEV_HOME/.claude/skills"
  install -d -o "$DEV_USER" -g "$DEV_USER" "$DEV_HOME/.agents" "$canon" "$links" "$DEV_HOME/.claude/agents"

  local d name
  for d in "$SCRIPT_DIR"/agents/skills/*/; do
    [[ -f "$d/SKILL.md" ]] || continue
    name="$(basename "$d")"
    rm -rf "${canon:?}/$name"
    cp -r "$d" "$canon/$name"
    ok "skill $name"
  done

  local a
  for a in "$SCRIPT_DIR"/agents/agents/*.md; do
    [[ -f "$a" ]] || continue
    install -m 644 "$a" "$DEV_HOME/.claude/agents/$(basename "$a")"
    ok "subagent $(basename "$a" .md) (Claude Code)"
  done

  local external="$SCRIPT_DIR/agents/external-skills.conf"
  if [[ -f "$external" ]] && as_dev 'command -v npx' &>/dev/null; then
    local source only choice
    while read -r source only; do
      [[ -z "$source" || "$source" == \#* ]] && continue
      choice=""
      [[ -n "$only" ]] && choice="-s ${only//,/ }"
      if as_dev_log "npx -y skills add '$source' -g -y $choice -a claude-code codex"; then
        ok "third-party skills: $source${only:+ ($only)}"
      else
        soft skills "third-party skills not installed: $source — sudo $0 --only=skills"
      fi
    done <"$external"
  else
    soft skills "npx missing or agents/external-skills.conf absent — third-party skills skipped"
  fi

  # A skill installed by an older version was a real folder in ~/.claude/skills:
  # it would shadow the symlink, hence the up-to-date version.
  for d in "$canon"/*/; do
    name="$(basename "$d")"
    [[ -d "$d" ]] || continue
    if [[ -e "$links/$name" && ! -L "$links/$name" ]]; then
      rm -rf "${links:?}/$name"
    fi
    ln -sfn "$canon/$name" "$links/$name"
  done

  # The full plugin for Claude Code — parallel agents, hooks, Python runtime —
  # which `npx skills` cannot lay down. Codex only gets the skills.
  if as_dev 'command -v claude' &>/dev/null; then
    if as_dev 'claude plugin list 2>/dev/null' | grep -q 'claude-seo'; then
      skip "claude-seo plugin"
    else
      as_dev_log 'claude plugin marketplace add AgriciDaniel/claude-seo' || true
      if as_dev_log 'claude plugin install claude-seo@agricidaniel-seo --scope user'; then
        ok "claude-seo plugin (Claude Code) — first time: /seo setup in a session"
      else
        soft skills "claude-seo plugin not installed — claude plugin install claude-seo@agricidaniel-seo"
      fi
    fi
  fi

  chown -R "$DEV_USER:$DEV_USER" "$DEV_HOME/.agents" "$links" "$DEV_HOME/.claude/agents"
  ok "skills laid down in $canon, linked for Claude Code"
}

# =============================================================================
#  10 — Projects
# =============================================================================
phase_projects() {
  head2 "10/12 — Projects"
  install -d -o "$DEV_USER" -g "$DEV_USER" "$PROJECTS_DIR"

  local name_ dir repo pkg host port sub cmd install
  while IFS='|' read -r name_ dir repo pkg host port sub cmd install; do
    port="${port##*:}"
    [[ -z "$name_" || "$name_" == \#* ]] && continue
    local root="$PROJECTS_DIR/${dir%%/*}" wd="$PROJECTS_DIR/$dir"

    # A git@github.com remote requires the server's key to be registered on the
    # account. When gh is authenticated, HTTPS goes through its credential helper
    # and works with no key — we prefer that path, which is safer.
    if [[ "$repo" == git@github.com:* ]] && as_dev 'gh auth status' &>/dev/null; then
      repo="https://github.com/${repo#git@github.com:}"
    fi

    if [[ "$repo" != "-" ]]; then
      if [[ -d "$root/.git" ]]; then
        as_dev_log "git -C '$root' fetch --all --prune"
        skip "${dir%%/*}"
      else
        say "  ${D}cloning ${dir%%/*}…${R}"
        if as_dev_log "git clone --recurse-submodules '$repo' '$root'"; then
          ok "${dir%%/*} cloned"
        else
          fail projects "cloning ${dir%%/*} ($repo)"
          note "repository access? gh auth status, or the server's key not added"
          continue
        fi
      fi
    fi
    [[ -d "$wd" ]] || { soft projects "$name_: $wd missing from the repository"; continue; }

    # The install command: column 9 of the registry when it is filled in,
    # derived from the package manager otherwise. Either way it is logged, so
    # that "how were these dependencies installed" always has an answer.
    local install_cmd
    install_cmd="$(install_command "$pkg" "$install")"
    if [[ -z "$install_cmd" ]]; then
      skip "$name_: nothing to install ($pkg)"
    elif as_dev_log "cd '$wd' && $install_cmd"; then
      ok "$name_: $install_cmd"
    elif [[ "$pkg" == pnpm && "$install_cmd" == "pnpm install" ]]; then
      # Two frequent causes: a lockfile generated by another pnpm version, and a
      # "prepare" script (husky) that fails outside a git repository. We retry
      # working around both — but only for the command we derived ourselves,
      # never for one the user wrote.
      if as_dev_log "cd '$wd' && pnpm install --no-frozen-lockfile --ignore-scripts"; then
        ok "$name_: pnpm install (lockfile relaxed, scripts skipped)"
      else
        soft projects "$name_: $install_cmd"
        note "$(as_dev "cd '$wd' && pnpm install 2>&1 | grep -m1 -E 'ERR_|ERROR|error' " 2>/dev/null | head -1)"
      fi
    else
      soft projects "$name_: $install_cmd"
    fi

    prepare_env "$name_" "$root" "$wd"
  done < <(registry)
}

# Generates a project's .env.local by delegating to bin/dev-env — the same
# implementation as the `dev env` command, so there is a single behaviour to
# maintain. It knows two things the provisioning did not: substituting
# {{OP_VAULT}} / {{OP_ITEM}} before `op inject`, which refuses those braces, and
# rewriting the local URLs of the .env.local to the tunnel's public URL — without
# which auth libraries answer "Invalid origin".
#
# projects.conf and DEV_DOMAIN are passed explicitly: at this step
# /etc/dev-stack.projects.conf is not laid down yet (step 11 does that), and
# without it the URL adaptation would simply do nothing.
prepare_env() {
  local name_="$1" root="$2" wd="$3"

  if [[ ! -x "$SCRIPT_DIR/bin/dev-env" ]]; then
    soft projects "$name_: bin/dev-env not found — .env.local not generated"
    return 0
  fi

  as_dev "DEV_STACK_CONF='$SCRIPT_DIR/projects.conf' DEV_DOMAIN='$DEV_DOMAIN' \
          '$SCRIPT_DIR/bin/dev-env' '$wd' '$root' '$name_'" 2>&1 \
    | tee -a "$LOG_FILE" >&2

  [[ -f "$wd/.env.local" ]] || soft projects "$name_: no .env.local — dev env $name_"
}

# =============================================================================
#  11 — Day-to-day tooling
# =============================================================================
phase_tooling() {
  head2 "11/12 — Tooling"

  install -m 755 "$SCRIPT_DIR/bin/dev" /usr/local/bin/dev 2>/dev/null && ok "dev command" \
    || fail tooling "bin/dev not found"
  install -m 755 "$SCRIPT_DIR/bin/dev-tui" /usr/local/bin/dev-tui 2>/dev/null && ok "dev tui dashboard" \
    || soft tooling "bin/dev-tui not found"
  install -m 755 "$SCRIPT_DIR/bin/dev-diag" /usr/local/bin/dev-diag 2>/dev/null && ok "dev-diag diagnosis" \
    || soft tooling "bin/dev-diag not found"
  install -m 755 "$SCRIPT_DIR/bin/dev-env" /usr/local/bin/dev-env 2>/dev/null && ok "dev-env generator" \
    || soft tooling "bin/dev-env not found"
  install -m 644 "$SCRIPT_DIR/projects.conf" /etc/dev-stack.projects.conf
  [[ -e /opt/dev-stack ]] || ln -sfn "$SCRIPT_DIR" /opt/dev-stack

  # The stack folder belongs to the dev user: it contains no secret (those live
  # in /etc/dev-stack.env, owned by root), and that is what allows updating it
  # with a plain `rsync` from your own machine, without sudo.
  if [[ "$(stat -c '%U' "$SCRIPT_DIR")" != "$DEV_USER" ]]; then
    chown -R "$DEV_USER:$DEV_USER" "$SCRIPT_DIR"
    ok "$SCRIPT_DIR given to $DEV_USER — direct rsync possible from your machine"
  fi

  # This file is the only one `dev` can read without being root: that is
  # therefore where the machine profile is recorded, once resolved. Without it,
  # `dev` would re-derive it on every call, and two places would be deciding the
  # same thing.
  cat >/etc/dev-stack.public.env <<EOF
export DEV_DOMAIN="$DEV_DOMAIN"
export PROJECTS_DIR="$PROJECTS_DIR"
export SHOTS_DIR="$SHOTS_DIR"
export SHOTS_PORT="$SHOTS_PORT"
export DEV_STACK_CONF="/etc/dev-stack.projects.conf"
export STACK_NAME="$STACK_NAME"
export STACK_DATABASE="$DATABASE_ENGINE"
export STACK_TUNNEL="$TUNNEL_PROVIDER"
export STACK_SECRETS="$SECRETS_PROVIDER"
export STACK_GIT="$GIT_PROVIDER"
export STACK_NEON="$NEON_ENABLED"
export STACK_SERVICES="$(declared_services)"
export DEBUG_PORTS="$DEBUG_PORTS"
# A user name and database names are not secrets, and the database command needs
# them without being root. The password stays inside the secrets file.
export STACK_DB_USER="$MYSQL_REMOTE_USER"
export STACK_DB_NAMES="${MYSQL_DATABASES:-}"
EOF
  chmod 644 /etc/dev-stack.public.env

  [[ -f "$DEV_HOME/.tmux.conf" ]] || {
    cat >"$DEV_HOME/.tmux.conf" <<'EOF'
set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc,xterm-ghostty:Tc"
set -g mouse on
set -g history-limit 50000
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -sg escape-time 10
set -g status-style 'bg=#0d1412 fg=#93a49e'
set -g status-left '#[fg=#54c9b6,bold] #S #[default]'
set -g status-right '#[fg=#93a49e]%H:%M #[fg=#54c9b6]@NAME@ '
setw -g window-status-current-style 'fg=#54c9b6,bold'
bind r source-file ~/.tmux.conf \; display "tmux reloaded"
EOF
    # The heredoc is quoted — otherwise tmux's "#[fg=…]" would be re-read by the
    # shell. So the machine name is substituted afterwards.
    sed -i "s|@NAME@|$STACK_NAME|" "$DEV_HOME/.tmux.conf"
    chown "$DEV_USER:$DEV_USER" "$DEV_HOME/.tmux.conf"; ok "tmux configured"; }

  [[ -f "$DEV_HOME/.zshrc" ]] || {
    cat >"$DEV_HOME/.zshrc" <<'EOF'
setopt AUTO_CD HIST_IGNORE_DUPS SHARE_HISTORY INTERACTIVE_COMMENTS
HISTSIZE=50000; SAVEHIST=50000; HISTFILE=$HOME/.zsh_history
autoload -Uz compinit && compinit -u
autoload -Uz vcs_info; precmd() { vcs_info }
zstyle ':vcs_info:git:*' formats ' %F{green}%b%f'
setopt PROMPT_SUBST
PROMPT='%F{cyan}%~%f${vcs_info_msg_0_} %F{yellow}❯%f '
eval "$($HOME/.local/bin/mise activate zsh 2>/dev/null || true)"
eval "$(direnv hook zsh 2>/dev/null || true)"
alias p='cd $PROJECTS_DIR'
alias ll='ls -lah --color=auto'
alias gs='git status -sb'
[[ -o interactive && -z "$TMUX" ]] && dev status 2>/dev/null
EOF
    chown "$DEV_USER:$DEV_USER" "$DEV_HOME/.zshrc"; ok "zsh configured"; }

  # What the shell announces to the terminal — prompt start, input start, current
  # folder — and which Pupitre needs in order to complete what you type.
  if install -m 644 "$SCRIPT_DIR/bin/pupitre.zsh" /etc/dev-stack.integration.zsh 2>/dev/null; then
    if ! grep -q 'dev-stack.integration.zsh' "$DEV_HOME/.zshrc" 2>/dev/null; then
      printf '\n[[ -r /etc/dev-stack.integration.zsh ]] && source /etc/dev-stack.integration.zsh\n' >>"$DEV_HOME/.zshrc"
      chown "$DEV_USER:$DEV_USER" "$DEV_HOME/.zshrc"
    fi
    ok "Pupitre shell integration"
  else
    soft tooling "bin/pupitre.zsh not found — no completion in Pupitre"
  fi
}

# =============================================================================
#  12 — Hardening — LAST, and only if dev is reachable
# =============================================================================
phase_harden() {
  head2 "12/12 — Hardening"

  if ! ufw status 2>/dev/null | grep -q 'Status: active'; then
    sh_quiet ufw --force default deny incoming
    sh_quiet ufw --force default allow outgoing
    sh_quiet ufw allow 22/tcp comment ssh
    sh_quiet ufw --force enable
    ok "firewall active (22/tcp only)"
  else
    skip "firewall"
  fi
  sh_quiet systemctl enable --now fail2ban

  local ak="$DEV_HOME/.ssh/authorized_keys"
  if [[ ! -s "$ak" ]]; then
    warn "root stays allowed over SSH: no key in $ak."
    note "fill in SSH_PUBLIC_KEY in $STACK_ENV then: sudo $0 --only=user,harden"
    return 0
  fi

  if [[ -f /etc/ssh/sshd_config.d/10-dev-stack.conf ]]; then
    skip "sshd hardened"
    return 0
  fi

  cat >/etc/ssh/sshd_config.d/10-dev-stack.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
AllowUsers $DEV_USER
ClientAliveInterval 30
ClientAliveCountMax 6
AcceptEnv LANG LC_* TERM COLORTERM
EOF
  if ! sshd -t 2>>"$LOG_FILE"; then
    rm -f /etc/ssh/sshd_config.d/10-dev-stack.conf
    fail harden "invalid sshd configuration — reverted, root stays reachable"
    return 1
  fi
  sh_quiet systemctl reload ssh || sh_quiet systemctl reload sshd
  ok "sshd hardened — root forbidden, keys only"
  note "from now on, connect with:  ssh $DEV_USER@$(hostname -I 2>/dev/null | awk '{print $1}')"
}

# =============================================================================
#  Final report
# =============================================================================
report() {
  say ""
  say "${B}════ Result ════${R}"
  say ""

  local chk
  chk() { if as_dev "$2" &>/dev/null || eval "$2" &>/dev/null; then ok "$1"; else bad "$1"; fi; }
  chk "node $(as_dev 'node -v' 2>/dev/null)"   "node -v"
  chk "bun $(as_dev 'bun -v' 2>/dev/null)"     "bun -v"
  chk "pnpm $(as_dev 'pnpm -v' 2>/dev/null)"   "pnpm -v"
  chk "java"                                    "java -version"
  with_database && chk "database"  "systemctl is-active --quiet mysql || systemctl is-active --quiet mariadb"
  with_tunnel   && chk "tunnel"    "systemctl is-active --quiet cloudflared"
  chk "gallery"          "systemctl is-active --quiet dev-shots"
  chk "dev command"      "command -v dev"
  chk "claude code"      "command -v claude"
  chk "agent skills"     "test -d $DEV_HOME/.agents/skills/server-dev"
  with_neon     && chk "neonctl"   "command -v neonctl"

  say ""
  if ((${#WARNED[@]})); then
    say "${YLW}${B}Warnings${R} ${D}(non-blocking)${R}"
    local w; for w in "${WARNED[@]}"; do say "  ${YLW}!${R} ${w#*|}"; done
    say ""
  fi

  if ((${#FAILED[@]})); then
    say "${RED}${B}${#FAILED[@]} step(s) failed${R}"
    local f
    for f in "${FAILED[@]}"; do
      say "  ${RED}✗${R} $(cut -d'|' -f2 <<<"$f")"
      say "    ${D}replay:${R} ${CYN}$(cut -d'|' -f3 <<<"$f")${R}"
    done
    say ""
    say "  ${D}Full log: $LOG_FILE${R}"
  else
    say "${GRN}${B}No step failed.${R}"
  fi

  say ""
  say "${B}Addresses${R}"
  local name_ dir repo pkg host port sub cmd
  while IFS='|' read -r name_ dir repo pkg host port sub cmd; do
    port="${port##*:}"
    [[ -z "$name_" || "$name_" == \#* ]] && continue
    # Without a tunnel, a project's address is its port: that is what we give,
    # rather than a public URL that would not answer.
    if with_tunnel && [[ "$sub" != "-" && -n "$sub" && -n "$DEV_DOMAIN" ]]; then
      printf '  %-20s https://%s.%s\n' "$name_" "$sub" "$DEV_DOMAIN" >&2
    else
      printf '  %-20s http://%s:%s\n' "$name_" "$host" "$port" >&2
    fi
  done < <(registry)
  say ""
  say "${B}Next${R}"
  say "  ${CYN}dev up all${R}   then   ${CYN}dev status${R}"
  say "  ${D}On your own machine:${R} ${CYN}./mac/setup-mac.sh --host <this server's address>${R}"
  say ""
}

# =============================================================================
#  Execution
# =============================================================================
say "${D}$(lsb_release -ds 2>/dev/null || echo Linux) · $(nproc) cores · $(free -g | awk '/^Mem:/{print $2}') GB RAM${R}"

if ! preflight; then
  exit 1
fi
if (( CHECK_ONLY )); then
  say "  ${D}--check: nothing was installed.${R}"
  say ""
  exit 0
fi

for p in "${PHASES[@]}"; do
  wanted "$p" || continue
  # Each step is isolated: an internal error does not kill the script.
  "phase_$p" || true
done

report
(( ${#FAILED[@]} == 0 ))
