#!/usr/bin/env zsh
# =============================================================================
#  deploy.sh — sends the stack to the server and replays what is needed.
#
#  Replaces the sequence of rsync/ssh you had to recompose every time.
#
#      ./deploy.sh                  sends the stack, reinstalls the tooling
#      ./deploy.sh tunnel           … and replays the "tunnel" step
#      ./deploy.sh tunnel,projects  several steps
#      ./deploy.sh skills           … the agent skills, after adding one
#      ./deploy.sh --all            replays EVERY step
#      ./deploy.sh --db             also sends the dumps from db/ (can be large)
#      ./deploy.sh --diag           sends, then prints the diagnosis report
#      ./deploy.sh --host <alias>   another server than the remembered one
#
#  Dumps and secrets.env are excluded by default: the former are heavy, the
#  latter has no business on the server (see push-secrets.sh).
#
#  The target comes from ~/.dev-stack/target.env, written by setup-mac.sh, or
#  from --host / the PUPITRE_SSH_HOST variable. Nothing is hard-coded.
# =============================================================================

emulate -L zsh
set -uo pipefail

HERE="${0:A:h}"
STACK="${HERE:h}"
DEST=/opt/dev-stack

[[ -r "$HOME/.dev-stack/target.env" ]] && source "$HOME/.dev-stack/target.env"
REMOTE=${PUPITRE_SSH_HOST:-${DEV_VPS_ALIAS:-dev-vps}}

PHASES=tooling
SEND_DB=0
DIAG=0

while (( $# )); do
  case $1 in
    --all)  PHASES=""; shift ;;
    --db)   SEND_DB=1; shift ;;
    --diag) DIAG=1; shift ;;
    --host) REMOTE=$2; shift 2 ;;
    -h|--help) sed -n '2,22p' "${0:A}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    -*)     print "unknown argument: $1"; exit 1 ;;
    *)      PHASES=$1; shift ;;
  esac
done

autoload -U colors && colors
info() { print -P "%F{cyan}▸%f $1" }
ok()   { print -P "  %F{green}✓%f $1" }
die()  { print -P "%F{red}✗%f $1"; exit 1 }

# --- Does the server answer? --------------------------------------------------
ssh -o ConnectTimeout=8 -o BatchMode=yes $REMOTE 'true' 2>/dev/null \
  || die "$REMOTE does not answer — run vps-check, or ./setup-mac.sh"

# --- Is the remote folder writable? -------------------------------------------
# Without this, rsync fails file by file with "Permission denied" and you think
# you have deployed when nothing left.
if ! ssh $REMOTE "test -w $DEST" 2>/dev/null; then
  info "The remote folder belongs to root — fixing"
  ssh $REMOTE "sudo chown -R \$(id -un):\$(id -gn) $DEST" \
    || die "could not change the owner of $DEST"
  ok "$DEST writable"
fi

# --- Sending ------------------------------------------------------------------
info "Sending the stack"
typeset -a excl
excl=(--exclude '.DS_Store' --exclude '.git' --exclude 'mac/secrets.env*'
      --exclude '__pycache__')
(( SEND_DB )) || excl+=(--exclude 'db/')

# macOS ships openrsync, which knows neither --info= nor several GNU rsync
# options. So we stick to the subset common to both.
rsync -az --delete-after "${excl[@]}" "$STACK/" "$REMOTE:$DEST/" \
  || die "rsync failed"
ssh $REMOTE "chmod +x $DEST/bootstrap.sh $DEST/bin/* $DEST/mac/*.sh 2>/dev/null; true"
ok "stack up to date on the server"

if (( SEND_DB )); then
  info "Sending the dumps (may take a while)"
  rsync -az --progress "$STACK/db/" "$REMOTE:$DEST/db/" || die "dump transfer interrupted"
  ok "dumps transferred"
fi

# --- Steps -------------------------------------------------------------------
if [[ -n $PHASES ]]; then
  info "Steps: $PHASES"
  ssh -t $REMOTE "sudo $DEST/bootstrap.sh --only=$PHASES"
else
  info "Every step"
  ssh -t $REMOTE "sudo $DEST/bootstrap.sh"
fi

(( DIAG )) && { print ""; ssh $REMOTE 'dev-diag'; }

print ""
print -P "%F{cyan}Next:%f  dev status   ·   tui   ·   dev-diag when something breaks"
