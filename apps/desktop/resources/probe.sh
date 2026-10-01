# pupitred probe — describes a machine before any installation.
#
# Sent in memory, never written to disk:
#   ssh <host> 'sh -s' < probe.sh
#
# POSIX sh, no jq, no bashisms. Read-only: no writes, no modifications.
# Writes to standard output JSON that conforms to the protocol's Probe schema. The Go probe
# in internal/probe reads the same files, runs the same commands and produces the same JSON.

set -u

ROOT=''
PROJECTS='/home/dev/projects'
CURRENT=''

while [ $# -gt 0 ]; do
  case $1 in
    --root=*) ROOT=${1#--root=} ;;
    --projects=*) PROJECTS=${1#--projects=} ;;
    --version=*) CURRENT=${1#--version=} ;;
    *)
      printf 'usage: sh probe.sh [--root=DIR] [--projects=DIR] [--version=VERSION]\n' >&2
      exit 2
      ;;
  esac
  shift
done

TAB=$(printf '\t')

at() {
  printf '%s%s' "$ROOT" "$1"
}

json_string() {
  printf '"%s"' "$(printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g' | tr -d '\001-\037\177')"
}

json_or_null() {
  if [ -z "$1" ]; then
    printf 'null'
  else
    json_string "$1"
  fi
}

os_field() {
  release=$(at /etc/os-release)
  [ -r "$release" ] || return 0

  sed -n "s/^$1=//p" "$release" | head -n 1 | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'\$/\1/"
}

normalize_arch() {
  case $1 in
    x86_64|amd64) printf 'amd64' ;;
    aarch64|arm64) printf 'arm64' ;;
    *) printf '%s' "$1" ;;
  esac
}

memory_mb() {
  total=$(free -b 2>/dev/null | awk '/^Mem:/ { printf "%.0f", $2; exit }')

  if [ -z "$total" ] || [ "$total" = 0 ]; then
    meminfo=$(at /proc/meminfo)
    total=''
    if [ -r "$meminfo" ]; then
      total=$(awk '/^MemTotal:/ { printf "%.0f", $2 * 1024; exit }' "$meminfo")
    fi
  fi

  [ -n "$total" ] || total=0

  awk -v bytes="$total" 'BEGIN { printf "%d", bytes / 1048576 }'
}

existing_dir() {
  candidate=$1
  while [ -n "$candidate" ] && [ "$candidate" != '/' ] && [ "$candidate" != '.' ]; do
    if [ -d "$candidate" ]; then
      printf '%s' "$candidate"
      return 0
    fi
    candidate=$(dirname "$candidate")
  done

  printf '/'
}

available_bytes() {
  bytes=$(df -P -B1 "$1" 2>/dev/null | awk 'NR == 2 { printf "%.0f", $4; exit }')
  [ -n "$bytes" ] || bytes=0

  printf '%s' "$bytes"
}

# The projects folder often lives on its own volume: the smaller of the two is the one that will run out.
free_gigabytes() {
  awk -v first="$1" -v second="$2" 'BEGIN {
    smallest = (first == 0 ? second : (second == 0 ? first : (first < second ? first : second)))
    tenths = int(smallest / 1073741824 * 10 + 0.5)
    printf "%d.%d", int(tenths / 10), tenths % 10
  }'
}

listening_ports() {
  raw=$(ss -ltnp 2>/dev/null)

  if [ -n "$raw" ]; then
    printf '%s\n' "$raw" | awk '
      $1 == "LISTEN" && NF >= 4 {
        count = split($4, parts, ":")
        port = parts[count]
        process = ""
        if (match($0, /\(\("[^"]+"/)) process = substr($0, RSTART + 3, RLENGTH - 4)
        if (port ~ /^[0-9]+$/ && port + 0 >= 1 && port + 0 <= 65535) print port "\t" process
      }' | merge_ports
    return 0
  fi

  raw=$(netstat -ltnp 2>/dev/null)
  [ -n "$raw" ] || return 0

  printf '%s\n' "$raw" | awk '
    ($1 == "tcp" || $1 == "tcp6") && $6 == "LISTEN" {
      count = split($4, parts, ":")
      port = parts[count]
      process = ""
      if (NF >= 7) {
        slash = index($7, "/")
        if (slash > 0) {
          process = substr($7, slash + 1)
          sub(/:$/, "", process)
        }
      }
      if (port ~ /^[0-9]+$/ && port + 0 >= 1 && port + 0 <= 65535) print port "\t" process
    }' | merge_ports
}

# The same port appears once per address family; keep the process name wherever it was readable.
merge_ports() {
  awk -F'\t' '
    {
      if (!($1 in process)) {
        process[$1] = $2
        order[++count] = $1
      } else if (process[$1] == "") {
        process[$1] = $2
      }
    }
    END { for (i = 1; i <= count; i++) print order[i] "\t" process[order[i]] }' | sort -n
}

docker_present() {
  for candidate in /usr/bin/docker /usr/local/bin/docker /var/lib/docker /run/docker.sock; do
    if [ -e "$(at "$candidate")" ]; then
      printf 'true'
      return 0
    fi
  done

  printf 'false'
}

panel_name() {
  if [ -d "$(at /usr/local/cpanel)" ]; then
    printf 'cPanel'
  elif [ -d "$(at /usr/local/psa)" ] || [ -d "$(at /opt/psa)" ]; then
    printf 'Plesk'
  elif [ -d "$(at /home/clp)" ] || [ -d "$(at /etc/cloudpanel)" ]; then
    printf 'CloudPanel'
  elif [ -d "$(at /www/server/panel)" ]; then
    printf 'aaPanel'
  fi
}

agent_version() {
  binary=$(at /usr/local/bin/pupitred)
  [ -x "$binary" ] || return 0

  "$binary" version 2>/dev/null | head -n 1 | awk '{ print $NF }'
}

module_ids() {
  report=$(at /var/lib/pupitre/report.json)
  [ -r "$report" ] || return 0

  tr '{},' '\n\n\n' < "$report" | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p'
}

account_names() {
  passwd_file=$(at /etc/passwd)
  [ -r "$passwd_file" ] || return 0

  awk -F: '$1 != "nobody" && $3 + 0 >= 1000 && $3 + 0 < 65000 { print $1 }' "$passwd_file"
}

can_sudo() {
  if [ "$(id -u 2>/dev/null)" = 0 ]; then
    printf 'true'
    return 0
  fi

  if sudo -n true >/dev/null 2>&1; then
    printf 'true'
    return 0
  fi

  # Decision 0015: a secured dev runs the agent's serve alone without a password, which is all a managed machine asks; -l asks without running it.
  agent=$(at /usr/local/bin/pupitred)
  if [ -x "$agent" ] && sudo -n -l "$agent" serve >/dev/null 2>&1; then
    printf 'true'
    return 0
  fi

  printf 'false'
}

OS=$(os_field ID)
VERSION=$(os_field VERSION_ID)
ARCH=$(normalize_arch "$(uname -m 2>/dev/null)")
RAM_MB=$(memory_mb)
DISK_GB=$(free_gigabytes "$(available_bytes /)" "$(available_bytes "$(existing_dir "$PROJECTS")")")
SUDO=$(can_sudo)
PORTS=$(listening_ports)
DOCKER=$(docker_present)
PANEL=$(panel_name)
AGENT=$(agent_version)
MODULES=$(module_ids)
ACCOUNTS=$(account_names)

PORTS_JSON=''
while IFS=$TAB read -r port process; do
  [ -n "$port" ] || continue

  if [ -n "$process" ]; then
    entry="{\"port\":$port,\"process\":$(json_string "$process")}"
  else
    entry="{\"port\":$port}"
  fi

  PORTS_JSON="${PORTS_JSON:+$PORTS_JSON,}$entry"
done <<PORTS_EOF
$PORTS
PORTS_EOF

MODULES_JSON=''
while IFS= read -r id; do
  [ -n "$id" ] || continue
  MODULES_JSON="${MODULES_JSON:+$MODULES_JSON,}$(json_string "$id")"
done <<MODULES_EOF
$MODULES
MODULES_EOF

ACCOUNT_LIST=''
while IFS= read -r name; do
  [ -n "$name" ] || continue
  ACCOUNT_LIST="${ACCOUNT_LIST:+$ACCOUNT_LIST, }$name"
done <<ACCOUNTS_EOF
$ACCOUNTS
ACCOUNTS_EOF

REASONS=''
FIXES=''

add_reason() {
  REASONS="${REASONS:+$REASONS,}$(json_string "$1")"
}

add_fix() {
  FIXES="${FIXES:+$FIXES,}$(json_string "$1")"
}

trim() {
  printf '%s' "$1" | sed -e 's/^[[:space:]]*//' -e 's/[[:space:]]*$//'
}

label() {
  trimmed=$(trim "$1")
  if [ -z "$trimmed" ]; then
    printf 'unknown'
  else
    printf '%s' "$trimmed"
  fi
}

LEVEL='ready'
KIND='bare'
UP_TO_DATE=''
BLOCKED=0

case "$OS $VERSION" in
  'ubuntu 22.04'|'ubuntu 24.04') ;;
  *)
    add_reason "Unsupported distribution: $(label "$OS $VERSION"). Pupitre asks for Ubuntu 22.04 or 24.04."
    add_fix "Reinstall the server from an Ubuntu 24.04 LTS image, then run the inspection again."
    BLOCKED=1
    ;;
esac

case $ARCH in
  amd64|arm64) ;;
  *)
    add_reason "Unsupported architecture: $(label "$ARCH"). Pupitre ships amd64 and arm64 binaries only."
    add_fix "Pick an amd64 (x86_64) or arm64 (aarch64) server."
    BLOCKED=1
    ;;
esac

if [ "$RAM_MB" -lt 4096 ]; then
  add_reason "Not enough memory: $RAM_MB MB. Pupitre asks for 4096 MB at least."
  add_fix "Move the server to a plan with at least 4 GB of memory."
  BLOCKED=1
fi

if [ "$SUDO" != true ]; then
  add_reason "Passwordless sudo is not available for the current user."
  add_fix "Sign in as root, or give this account NOPASSWD in /etc/sudoers.d/."
  BLOCKED=1
fi

if [ "$BLOCKED" -eq 1 ]; then
  LEVEL='blocked'
  KIND='incompatible'
elif [ -n "$AGENT" ]; then
  KIND='managed'
  if [ -z "$CURRENT" ] || [ "$AGENT" = "$CURRENT" ]; then
    UP_TO_DATE='true'
    add_reason "Pupitre is already installed: agent $AGENT, up to date."
  else
    UP_TO_DATE='false'
    LEVEL='warning'
    add_reason "Pupitre is already installed: agent $AGENT, the current version is $CURRENT."
    add_fix "Update the agent from the app before installing any service."
  fi
else
  OCCUPIED=0

  if [ "$DOCKER" = true ]; then
    add_reason "Docker is installed: its containers, its networks and its firewall rules would stay in place."
    add_fix "Remove Docker for a dedicated machine, or install anyway: Pupitre will not touch it."
    OCCUPIED=1
  fi

  if [ -n "$PANEL" ]; then
    add_reason "A hosting panel was found: $PANEL. It fights Pupitre over nginx, the users and the firewall."
    add_fix "Pick a server without a hosting panel."
    OCCUPIED=1
  fi

  WEB=0
  while IFS=$TAB read -r port process; do
    case "$port" in
      80|443) ;;
      *) continue ;;
    esac

    if [ -n "$process" ]; then
      add_reason "Port $port is already listened on by $process."
    else
      add_reason "Port $port is already listened on."
    fi
    WEB=1
  done <<WEB_EOF
$PORTS
WEB_EOF

  if [ "$WEB" -eq 1 ]; then
    add_fix "Free ports 80 and 443, or install anyway: tunnel exposure does not use them."
    OCCUPIED=1
  fi

  if [ -n "$ACCOUNT_LIST" ]; then
    add_reason "Non-system accounts already exist: $ACCOUNT_LIST."
    add_fix "Check that these accounts live alongside the dev user Pupitre creates."
    OCCUPIED=1
  fi

  if [ "$OCCUPIED" -eq 1 ]; then
    LEVEL='warning'
    KIND='occupied'
  else
    add_reason "A bare machine: $OS $VERSION $ARCH, $RAM_MB MB of memory, $DISK_GB GB free."
  fi
fi

VERDICT="\"level\":$(json_string "$LEVEL"),\"kind\":$(json_string "$KIND")"
if [ -n "$UP_TO_DATE" ]; then
  VERDICT="$VERDICT,\"up_to_date\":$UP_TO_DATE"
fi
VERDICT="$VERDICT,\"reasons\":[$REASONS],\"fixes\":[$FIXES]"

printf '{"os":%s,"version":%s,"arch":%s,"ram_mb":%s,"disk_free_gb":%s,"sudo":%s,"ports":[%s],"docker":%s,"panel":%s,"agent_version":%s,"installed_modules":[%s],"verdict":{%s}}\n' \
  "$(json_string "$OS")" \
  "$(json_string "$VERSION")" \
  "$(json_string "$ARCH")" \
  "$RAM_MB" \
  "$DISK_GB" \
  "$SUDO" \
  "$PORTS_JSON" \
  "$DOCKER" \
  "$(json_or_null "$PANEL")" \
  "$(json_or_null "$AGENT")" \
  "$MODULES_JSON" \
  "$VERDICT"
