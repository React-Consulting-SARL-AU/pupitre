#!/usr/bin/env zsh
# =============================================================================
#  push-secrets.sh — sends the server configuration from your own machine.
#
#  You keep your secrets in ONE local file, here. This script sends it to the
#  server as /etc/dev-stack.env. No more typing into nano over SSH, and
#  reinstalling the server costs nothing but one command.
#
#      ./push-secrets.sh                    dev, then root as a fallback
#      ./push-secrets.sh --host 203.0.113.10 --user root
#      ./push-secrets.sh --user dev         to force the account
#      ./push-secrets.sh --edit             opens the local file
#      ./push-secrets.sh --pull             fetches the server's version
#
#  The local file is mac/secrets.env, ignored by git. It never leaves your
#  machine other than towards this server, over SSH.
#
#  The target comes from ~/.dev-stack/target.env, written by setup-mac.sh, or
#  from --host. Nothing is hard-coded.
# =============================================================================

emulate -L zsh
set -euo pipefail

HERE="${0:A:h}"
LOCAL="$HERE/secrets.env"
SAMPLE="$HERE/../env.example"
REMOTE_PATH=/etc/dev-stack.env

[[ -r "$HOME/.dev-stack/target.env" ]] && source "$HOME/.dev-stack/target.env"
HOST="${PUPITRE_SSH_HOST:-${DEV_VPS_HOST:-${DEV_VPS_ALIAS:-}}}"
USER_=""          # empty = try dev, then root
ACTION=push

while (( $# )); do
  case $1 in
    --host) HOST=$2; shift 2 ;;
    --user) USER_=$2; shift 2 ;;
    --edit) ACTION=edit; shift ;;
    --pull) ACTION=pull; shift ;;
    -h|--help) sed -n '2,22p' "${0:A}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) print "unknown argument: $1"; exit 1 ;;
  esac
done

autoload -U colors && colors
ok()   { print -P "  %F{green}✓%f $1" }
warn() { print -P "  %F{yellow}!%f $1" }
info() { print -P "%F{cyan}▸%f $1" }

# --- The local file -----------------------------------------------------------
if [[ ! -f $LOCAL ]]; then
  if [[ -f $SAMPLE ]]; then
    cp "$SAMPLE" "$LOCAL"
    chmod 600 "$LOCAL"
    info "secrets.env created from env.example"
    print ""
    print "  Fill it in, then rerun:"
    print "      ${0:t} --edit"
    print "      ${0:t}"
    print ""
    exit 0
  fi
  print "neither $LOCAL nor $SAMPLE — incomplete folder"; exit 1
fi
chmod 600 "$LOCAL"

if [[ $ACTION == edit ]]; then
  exec "${EDITOR:-nano}" "$LOCAL"
fi

if [[ -z $HOST ]]; then
  print "No target known. Run ./setup-mac.sh first, or pass --host <address>."
  exit 1
fi

if [[ $ACTION == pull ]]; then
  info "fetching from ${USER_:+$USER_@}$HOST"
  if [[ $USER_ == root ]]; then
    ssh "root@$HOST" "cat $REMOTE_PATH" >"$LOCAL.pulled"
  else
    ssh "${USER_:+$USER_@}$HOST" "sudo cat $REMOTE_PATH" >"$LOCAL.pulled"
  fi
  chmod 600 "$LOCAL.pulled"
  ok "written to $LOCAL.pulled — compare before overwriting:"
  print "      diff $LOCAL $LOCAL.pulled"
  exit 0
fi

# --- Checks before sending ----------------------------------------------------
# Only the SSH key is truly blocking: everything else is a service you may not
# want. So we check that one, and merely report what is empty among the rest.
info "Checking the local file"
if ! grep -qE '^SSH_PUBLIC_KEY="?ssh-' "$LOCAL"; then
  warn "SSH_PUBLIC_KEY is empty or does not look like a public key"
  warn "without it, nobody can log in to the server"
  print -n "Send anyway? [y/N] "; read -q reply || true; print ""
  [[ $reply == [yY] ]] || exit 1
else
  ok "SSH_PUBLIC_KEY filled in"
fi

typeset -a empty
for v in DATABASE_ENGINE TUNNEL_PROVIDER SECRETS_PROVIDER; do
  grep -qE "^${v}=[\"']?[a-z]" "$LOCAL" || empty+=("$v")
done
(( ${#empty} )) && warn "left at their default: ${empty[*]} (auto — derived from what is filled in)"

# The classic mistake: pasting the PRIVATE key instead of the public one.
if grep -q "BEGIN OPENSSH PRIVATE KEY" "$LOCAL"; then
  print "STOP: this file contains a private key. SSH_PUBLIC_KEY expects the"
  print "      public line \"ssh-ed25519 AAAA…\", nothing else."
  exit 1
fi

# --- Sending ------------------------------------------------------------------
# A failed send MUST be heard. `set -e` does not catch the failure of the left
# operand of an `&&`: without an explicit test, a refused scp looked like a
# success and the server silently kept its previous configuration.
send_as() {
  local u=$1
  if [[ $u == root ]]; then
    scp -q "$LOCAL" "$u@$HOST:$REMOTE_PATH" || return 1
    ssh "$u@$HOST" "chmod 600 $REMOTE_PATH" || return 1
  else
    # /etc/dev-stack.env belongs to root: we drop it in the home folder, then
    # install it with sudo.
    scp -q "$LOCAL" "$u@$HOST:~/.dev-stack.env.tmp" || return 1
    ssh "$u@$HOST" "sudo install -m 600 -o root -g root ~/.dev-stack.env.tmp $REMOTE_PATH && rm -f ~/.dev-stack.env.tmp" || return 1
  fi
}

# Without --user, we try dev then root. That is the useful order: root no longer
# accepts SSH once the "harden" step has run, which is the server's normal state
# — but it is the only account available at the very first install.
typeset -a candidates
if [[ -n $USER_ ]]; then candidates=("$USER_"); else candidates=("${VPS_USER:-dev}" root); fi

sent=""
for u in $candidates; do
  info "Sending to $u@$HOST:$REMOTE_PATH"
  if send_as "$u"; then sent=$u; break; fi
  warn "$u: refused"
done

if [[ -z $sent ]]; then
  print ""
  print "FAILED: the configuration was NOT sent — the server keeps the previous one."
  print "  · root is forbidden over SSH after the \"harden\" step, by design;"
  print "  · the dev account requires your public key to be in its authorized_keys."
  print "To see where it is stuck:  ssh -v dev@$HOST"
  exit 1
fi

ok "configuration sent (account $sent)"

print ""
print "Next, on the server:"
if [[ $sent == root ]]; then
  print "      ssh $sent@$HOST '/opt/dev-stack/bootstrap.sh --check'"
  print "      ssh $sent@$HOST '/opt/dev-stack/bootstrap.sh'"
else
  print "      ssh $sent@$HOST 'sudo /opt/dev-stack/bootstrap.sh --check'"
  print "      ssh $sent@$HOST 'sudo /opt/dev-stack/bootstrap.sh'"
fi
print ""
