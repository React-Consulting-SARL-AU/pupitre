#!/usr/bin/env zsh
# =============================================================================
#  setup-mac.sh — the macOS side.
#
#  To be run ONCE on your Mac, after bootstrap.sh has finished on the server.
#  Touches nothing but ~/.ssh/config, ~/.zshrc (one delimited block) and
#  ~/.dev-stack/. Idempotent: rerunnable without damage.
#
#      ./setup-mac.sh                              # interactive
#      ./setup-mac.sh --host 203.0.113.10
#      ./setup-mac.sh --host srv.example.org --domain dev.example.org
#      ./setup-mac.sh --key ~/.ssh/id_ed25519_dev
#      ./setup-mac.sh --alias my-server            # the ~/.ssh/config host name
#
#  Nothing is hard-coded: the address, the domain and the SSH alias all come from
#  the command line or from what you are asked. What is remembered is written to
#  ~/.dev-stack/target.env, so a rerun does not ask again.
#
#  Compatible with the 1Password SSH agent: if the private key lives in the
#  vault, only the public one is needed on disk.
# =============================================================================

emulate -L zsh
set -euo pipefail

HERE="${0:A:h}"
STATE="$HOME/.dev-stack"
TARGET_ENV="$STATE/target.env"

# What was remembered from a previous run, if anything.
[[ -r $TARGET_ENV ]] && source "$TARGET_ENV"

VPS_USER=${VPS_USER:-dev}
VPS_HOST=${DEV_VPS_HOST:-}
SSH_ALIAS=${DEV_VPS_ALIAS:-dev-vps}
DEV_DOMAIN=${DEV_DOMAIN:-}
SSH_KEY=""
MARK_START="# >>> dev-stack >>>"
MARK_END="# <<< dev-stack <<<"

while (( $# )); do
  case $1 in
    --host)   VPS_HOST=$2; shift 2 ;;
    --user)   VPS_USER=$2; shift 2 ;;
    --alias)  SSH_ALIAS=$2; shift 2 ;;
    --domain) DEV_DOMAIN=$2; shift 2 ;;
    --key)    SSH_KEY=${2:a}; shift 2 ;;
    -h|--help) sed -n '2,22p' "${0:A}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print "unknown argument: $1"; exit 1 ;;
  esac
done

autoload -U colors && colors
ok()   { print -P "  %F{green}✓%f $1" }
warn() { print -P "  %F{yellow}!%f $1" }
info() { print -P "%F{cyan}▸%f $1" }

# --- 1. The server's address --------------------------------------------------
# We only keep an address that ANSWERS. An unreachable address written into
# ~/.ssh/config turns every command into a silent wait of several tens of
# seconds — the worst symptom, because it does not look like an error.
info "Server"
reachable() { nc -z -G 5 "$1" 22 2>/dev/null }

if [[ -z $VPS_HOST ]]; then
  print "Address of your server (IP or hostname), the one you SSH into:"
  print -n "  host: "; read VPS_HOST
fi
[[ -n $VPS_HOST ]] || { print "missing address"; exit 1 }
if reachable "$VPS_HOST"; then
  ok "$VPS_HOST answers on port 22"
else
  warn "$VPS_HOST does not answer on port 22 — carrying on anyway"
fi

if [[ -z $DEV_DOMAIN ]]; then
  print ""
  print "Public domain of the projects, if the server has a tunnel."
  print "Leave empty if it has none: projects are reached on their port."
  print -n "  domain (optional): "; read DEV_DOMAIN
fi

# --- 2. SSH key ---------------------------------------------------------------
info "SSH key"

# 1Password SSH agent: the private key never leaves the vault, and therefore does
# NOT exist on disk. Only the public part is placed in ~/.ssh, and that is what
# we reference — ssh asks the agent for the signature.
OP_AGENT="$HOME/Library/Group Containers/2BUA8C4S2C.com.1password/t/agent.sock"
USE_OP_AGENT=0
[[ -S $OP_AGENT ]] && { USE_OP_AGENT=1; ok "1Password SSH agent detected" }

if [[ -n $SSH_KEY ]]; then
  # --key accepts either the private or the public key.
  SSH_KEY=${SSH_KEY%.pub}
elif (( USE_OP_AGENT )); then
  typeset -a pubs
  pubs=($HOME/.ssh/*.pub(.N))
  if (( ${#pubs} == 1 )); then
    SSH_KEY=${pubs[1]%.pub}
  elif (( ${#pubs} > 1 )); then
    print "Public keys present in ~/.ssh:"
    typeset -i i=1
    for k in $pubs; do print "  $i) ${k:t}"; (( i++ )); done
    print -n "Which one does the server authorise? [1] "
    read choice
    SSH_KEY=${pubs[${choice:-1}]%.pub}
  else
    print "No public key in ~/.ssh."
    print "In 1Password: open the SSH item → \"Copy public key\", then:"
    print "  pbpaste > ~/.ssh/dev-vps.pub"
    exit 1
  fi
elif [[ -f ~/.ssh/id_ed25519 ]]; then
  SSH_KEY=~/.ssh/id_ed25519
else
  typeset -a found
  found=($HOME/.ssh/id_*(.N))     # .N: regular files, no error if empty
  found=(${found:#*.pub})         # keep only the private keys
  if (( ${#found} == 1 )); then
    SSH_KEY=${found[1]}
  elif (( ${#found} > 1 )); then
    print "Several keys found:"
    typeset -i i=1
    for k in $found; do print "  $i) ${k:t}"; (( i++ )); done
    print -n "Which one does the server authorise? [1] "
    read choice
    SSH_KEY=${found[${choice:-1}]}
  else
    ssh-keygen -t ed25519 -N '' -C "$(whoami)@$(hostname -s)" -f ~/.ssh/id_ed25519
    SSH_KEY=~/.ssh/id_ed25519
    ok "key generated"
  fi
fi

[[ -f $SSH_KEY.pub ]] || { print "public part not found: $SSH_KEY.pub"; exit 1 }
if (( USE_OP_AGENT )) && [[ ! -f $SSH_KEY ]]; then
  ok "key ${SSH_KEY:t} — private part kept in 1Password"
else
  ok "key used: $SSH_KEY"
fi
print ""
print "Paste this line into SSH_PUBLIC_KEY of /etc/dev-stack.env on the server:"
print -P "%F{242}$(cat $SSH_KEY.pub)%f"
print ""

# --- 3. ~/.ssh/config ---------------------------------------------------------
info "SSH configuration"
mkdir -p ~/.ssh; chmod 700 ~/.ssh
touch ~/.ssh/config; chmod 600 ~/.ssh/config
if grep -q "$MARK_START" ~/.ssh/config; then
  /usr/bin/sed -i '' "/$MARK_START/,/$MARK_END/d" ~/.ssh/config
fi
IDENTITY_LINE="    IdentityFile $SSH_KEY"
AGENT_LINE=""
if (( USE_OP_AGENT )); then
  # We point at the PUBLIC key: ssh reads the fingerprint from it and asks the
  # 1Password agent, which holds the private one, for the signature.
  IDENTITY_LINE="    IdentityFile $SSH_KEY.pub"
  AGENT_LINE="    IdentityAgent \"$OP_AGENT\""
fi

cat >>~/.ssh/config <<EOF
$MARK_START
Host $SSH_ALIAS
    HostName $VPS_HOST
    User $VPS_USER
$IDENTITY_LINE
$AGENT_LINE
    IdentitiesOnly yes
    # Without this timeout, an unreachable address makes you wait more than a
    # minute before any message at all.
    ConnectTimeout 10
    # Multiplexing: subsequent connections are instant, which matters a great
    # deal when an agent chains dozens of remote commands.
    ControlMaster auto
    ControlPath ~/.ssh/cm-%r@%h:%p
    ControlPersist 10m
    ServerAliveInterval 30
    ServerAliveCountMax 6
    # The database port, brought back locally: a client connects to
    # 127.0.0.1:3307 while nothing is open on the Internet.
    LocalForward 3307 127.0.0.1:3306
    # JVM debugger ports, brought back the same way. Harmless when nothing
    # listens on the other side.
    LocalForward 5005 127.0.0.1:5005
    LocalForward 5006 127.0.0.1:5006
    ForwardAgent yes
$MARK_END
EOF
ok "Host $SSH_ALIAS added (ssh $SSH_ALIAS)"

# What we remember, so a rerun does not ask again.
mkdir -p "$STATE"
cat >"$TARGET_ENV" <<EOF
# Written by setup-mac.sh — the server this Mac drives.
DEV_VPS_HOST="$VPS_HOST"
DEV_VPS_ALIAS="$SSH_ALIAS"
DEV_DOMAIN="$DEV_DOMAIN"
VPS_USER="$VPS_USER"
EOF
chmod 600 "$TARGET_ENV"

# --- 4. Shell aliases and helpers ---------------------------------------------
info "Shell aliases"
cat >"$STATE/aliases.zsh" <<EOF
# Generated by setup-mac.sh — do not edit by hand.
export DEV_VPS_HOST="$VPS_HOST"
export DEV_VPS_ALIAS="$SSH_ALIAS"
export DEV_DOMAIN="$DEV_DOMAIN"

# Connection and driving
alias vps='ssh $SSH_ALIAS'
# Machine reboot, with its memory summary and its confirmation.
alias vps-reboot='ssh -t $SSH_ALIAS "dev reboot"'
alias vps-status='ssh $SSH_ALIAS dev status'
alias vps-doctor='ssh $SSH_ALIAS dev doctor'
alias vps-urls='ssh $SSH_ALIAS dev url'
alias tui='ssh -t $SSH_ALIAS "dev tui"'              # the dashboard
alias vpsd='ssh -t $SSH_ALIAS "dev attach"'          # attach to tmux

# The projects root, as the server declares it: nothing is assumed here.
_vps_root() { ssh $SSH_ALIAS 'print -r -- \${PROJECTS_DIR:-\$HOME/projects}' }

# The folder of a project, read from the server's registry.
_vps_dir() {
  ssh $SSH_ALIAS "awk -F'|' -v n='\$1' '\\\$1 == n {print \\\$2; exit}' /etc/dev-stack.projects.conf"
}

# Opens a project FROM THE SERVER in Zed, which runs locally. Zed inherits the
# Host block from ~/.ssh/config, and therefore the agent.
#
# We open the ROOT of the repository, not the service's subfolder: in a monorepo,
# editing apps/web without seeing packages/ makes no sense.
zed-vps() {
  local p=\${1:?usage: zed-vps <project>}
  local dir=\$(_vps_dir "\$p")
  [[ -n \$dir ]] || { print "unknown project: \$p"; return 1 }
  zed "ssh://$SSH_ALIAS\$(_vps_root)/\${dir%%/*}"
}

# Opens a project FROM THE SERVER in IntelliJ, through JetBrains Gateway.
#
# Gateway wants the path of the backend already installed on the server: we
# discover it rather than making you copy it by hand. As long as no backend is
# there — so before the very first connection — we point you at Gateway, which
# knows how to download it.
idea-vps() {
  local p=\${1:?usage: idea-vps <project>}
  local dir=\$(_vps_dir "\$p")
  [[ -n \$dir ]] || { print "unknown project: \$p"; return 1 }

  local root=\$(_vps_root)
  local ide=\$(ssh $SSH_ALIAS 'ls -dt ~/.cache/JetBrains/RemoteDev/dist/*/ 2>/dev/null | head -1')
  if [[ -z \$ide ]]; then
    print "No remote IDE installed yet."
    print "Open JetBrains Gateway once — it will download it:"
    print "  open -a 'JetBrains Gateway'"
    print "  then SSH → $SSH_ALIAS → \$root/\${dir%%/*}"
    return 1
  fi

  local url="jetbrains-gateway://connect#type=ssh&deploy=false&host=$VPS_HOST&port=22&user=$VPS_USER"
  url+="&idePath=\$(print -r -- \${ide%/} | sed 's:/:%2F:g')"
  url+="&projectPath=\$(print -r -- "\$root/\${dir%%/*}" | sed 's:/:%2F:g')"
  open "\$url"
}

# --- One-command diagnosis when nothing answers any more ---------------------
vps-check() {
  print "Configured HostName: \$DEV_VPS_HOST"
  nc -z -G 5 "\$DEV_VPS_HOST" 22 2>/dev/null && print "  port 22: reachable" \\
    || print "  port 22: UNREACHABLE — right address? server started?"
  ssh -o ConnectTimeout=8 -o BatchMode=yes $SSH_ALIAS 'echo "  ssh: ok"' 2>&1 | tail -3
}

# Relays \`dev …\` on the server. Subcommands that take over the screen (the
# dashboard, tmux, the agents) need a terminal: without -t, tmux answers
# "open terminal failed: not a terminal". We add it for those only, since -t on a
# non-interactive command dirties the output.
dev() {
  local tty_flag=""
  case "\$1" in
    tui|ui|attach|a|claude|codex) tty_flag="-t" ;;
    logs|l) [[ "\$2" == -f || "\$3" == -f ]] && tty_flag="-t" ;;
  esac
  ssh \$tty_flag -o ConnectTimeout=8 $SSH_ALIAS "dev \$*"
}

# Claude Code / Codex running ON the server, displayed in your terminal
vclaude() { ssh -t $SSH_ALIAS "dev claude \${1:?project?}" }
vcodex()  { ssh -t $SSH_ALIAS "dev codex \${1:?project?}" }

# The server's database, through the LocalForward: port 3306 there, 3307 here.
# The user and the database name come from the server, which is the only place
# that knows them.
vps-db() {
  local url=\$(ssh $SSH_ALIAS 'dev db url' 2>/dev/null | head -1)
  [[ -n \$url ]] || { print "this server has no local database"; return 1 }
  local user=\${\${url#mysql://}%%@*}
  local db=\${url##*/}
  print "mysql -h 127.0.0.1 -P 3307 -u \$user -p \$db"
  mysql -h 127.0.0.1 -P 3307 -u "\$user" -p "\$db"
}

# --- Screenshots produced on the server --------------------------------------
# Three ways to see them, from the lightest to the most integrated.
export VPS_SHOTS_DIR="\$HOME/Pictures/vps-shots"

# 1. The gallery, in the browser.
shots() {
  local url=\$(ssh $SSH_ALIAS 'dev shots url' 2>/dev/null | head -1)
  [[ -n \$url ]] && open "\$url" || print "gallery unreachable"
}

# 2. Bring back the whole folder (a local mirror, on demand).
vps-shots() {
  mkdir -p "\$VPS_SHOTS_DIR"
  if [[ \$1 == -w || \$1 == --watch ]]; then
    print "Continuous sync to \$VPS_SHOTS_DIR — Ctrl-C to stop."
    while true; do
      rsync -az --delete $SSH_ALIAS:shots/ "\$VPS_SHOTS_DIR/" 2>/dev/null
      sleep 5
    done
  else
    rsync -az --delete $SSH_ALIAS:shots/ "\$VPS_SHOTS_DIR/"
    print "→ \$VPS_SHOTS_DIR"
  fi
}

# 3. The latest screenshot, brought back and opened. This is the one you use when
#    an agent runs on your MAC: the file becomes local, so the agent can read it
#    and show it in the conversation.
vps-shot() {
  local remote=\$(ssh $SSH_ALIAS 'shot --list' 2>/dev/null | head -1)
  [[ -n \$remote ]] || { print "no screenshot on the server"; return 1 }
  mkdir -p "\$VPS_SHOTS_DIR"
  local local_path="\$VPS_SHOTS_DIR/\${remote:t}"
  scp -q "$SSH_ALIAS:\$remote" "\$local_path" || return 1
  print "\$local_path"
  [[ \$1 == -o || \$1 == --open ]] && open "\$local_path"
}
EOF
ok "$STATE/aliases.zsh written"

if ! grep -q 'dev-stack/aliases.zsh' ~/.zshrc 2>/dev/null; then
  cat >>~/.zshrc <<'EOF'

# >>> dev-stack >>>
[[ -f "$HOME/.dev-stack/aliases.zsh" ]] && source "$HOME/.dev-stack/aliases.zsh"
# <<< dev-stack <<<
EOF
  ok "~/.zshrc wired up"
else
  ok "~/.zshrc already wired up"
fi

# --- 5. Ghostty (optional) ----------------------------------------------------
info "Ghostty"
GHOSTTY_DIR="$HOME/.config/ghostty"
SRC_CONF="$HERE/ghostty.conf"
if [[ -d /Applications/Ghostty.app || -n ${GHOSTTY_RESOURCES_DIR:-} ]]; then
  mkdir -p "$GHOSTTY_DIR"
  if [[ -f $SRC_CONF ]]; then
    cp "$SRC_CONF" "$GHOSTTY_DIR/dev-stack.conf"
    ok "$GHOSTTY_DIR/dev-stack.conf written"
    touch "$GHOSTTY_DIR/config"
    if ! grep -q 'dev-stack.conf' "$GHOSTTY_DIR/config"; then
      print "config-file = dev-stack.conf" >>"$GHOSTTY_DIR/config"
      ok "include added to your Ghostty config (nothing overwritten)"
    else
      ok "include already present"
    fi
  fi

  # THE point that breaks everything if forgotten: Ghostty announces
  # TERM=xterm-ghostty, which the server does not know. Without this terminfo
  # entry, `dev tui`, tmux and even `less` render crooked. We install it on the
  # server, once.
  # Ghostty's terminfo lives inside the app bundle, not in the system database:
  # without TERMINFO, infocmp cannot find it from another terminal.
  GT="/Applications/Ghostty.app/Contents/Resources/terminfo"
  if ssh -o ConnectTimeout=8 -o BatchMode=yes $SSH_ALIAS 'infocmp xterm-ghostty' &>/dev/null; then
    ok "xterm-ghostty terminfo already present on the server"
  elif TERMINFO="$GT" infocmp -x xterm-ghostty 2>/dev/null | ssh $SSH_ALIAS -- tic -x - 2>/dev/null; then
    ok "xterm-ghostty terminfo installed on the server"
  else
    # No consequence: bootstrap.sh sets up a fallback to xterm-256color.
    ok "terminfo not transferred — the server will use its xterm-256color fallback"
  fi
else
  ok "Ghostty not detected — install it with: brew install --cask ghostty"
fi

# --- 6. Verification ----------------------------------------------------------
info "Connection test"
if ssh -o ConnectTimeout=8 -o BatchMode=yes $SSH_ALIAS 'echo ok' &>/dev/null; then
  ok "ssh $SSH_ALIAS works"
  ssh $SSH_ALIAS 'dev status' || true
else
  warn "connection not possible yet — is the public key really in"
  warn "/etc/dev-stack.env on the server, with bootstrap.sh --only=user rerun?"
fi

print ""
print -P "%F{cyan}Done.%f Open a new terminal, then:"
print "  vps                 # shell on the server"
print "  dev status          # project state, from here"
print "  tui                 # the full-screen dashboard"
print "  vclaude <project>   # Claude Code on the server, in that project"
print "  vps-shot -o         # bring back and open the latest screenshot"
print ""
print -P "%F{242}In Pupitre, open Settings → Servers and pick the host \"$SSH_ALIAS\".%f"
print ""
