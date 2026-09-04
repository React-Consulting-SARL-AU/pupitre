package system

import (
	"fmt"
	"strings"
)

const sudoers = "dev ALL=(ALL) NOPASSWD:ALL\n"

const sysctl = `fs.inotify.max_user_watches=524288
fs.inotify.max_user_instances=1024
vm.swappiness=10
`

const aptPeriodic = `APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
`

const zshrcBase = `setopt AUTO_CD HIST_IGNORE_DUPS SHARE_HISTORY INTERACTIVE_COMMENTS
HISTSIZE=50000
SAVEHIST=50000
HISTFILE=$HOME/.zsh_history
autoload -Uz compinit && compinit -u
autoload -Uz add-zsh-hook vcs_info
add-zsh-hook precmd vcs_info
zstyle ':vcs_info:git:*' formats ' %F{green}%b%f'
setopt PROMPT_SUBST
PROMPT='%F{cyan}%~%f${vcs_info_msg_0_} %F{yellow}❯%f '
alias p='cd "$PROJECTS_DIR"'
alias ll='ls -lah --color=auto'
alias gs='git status -sb'
`

// OSC 133 (prompt, input, command, exit code) and OSC 7 (folder), read by the app's terminal; mirrors server/bin/pupitre.zsh.
const zshrcBlockTemplate = `export PROJECTS_DIR=%s
[[ -x "$HOME/.local/bin/mise" ]] && eval "$("$HOME/.local/bin/mise" activate zsh)"
autoload -Uz add-zsh-hook
_pupitre_cwd() { printf '\e]7;file://%%s%%s\a' "${HOST:-}" "${PWD// /%%20}"; }
_pupitre_precmd() {
  local code=$?
  printf '\e]133;D;%%s\a' "$code"
  _pupitre_cwd
  printf '\e]133;A\a'
  [[ $PS1 == *$'\e]133;B'* ]] || PS1="${PS1}%%{"$'\e]133;B\a'"%%}"
}
_pupitre_preexec() { printf '\e]133;C\a'; }
add-zsh-hook precmd _pupitre_precmd
add-zsh-hook preexec _pupitre_preexec
`

// The same markers for a bash terminal, in bash's own words: PROMPT_COMMAND for the prompt, a DEBUG trap for the command that leaves.
// The whole block is guarded rather than returning early: .bashrc goes on being read after it.
const bashrcBlockTemplate = `export PROJECTS_DIR=%s
[ -x "$HOME/.local/bin/mise" ] && eval "$("$HOME/.local/bin/mise" activate bash)"
if [[ $- == *i* && -z ${_PUPITRE_INTEGRATION:-} ]]; then
  _PUPITRE_INTEGRATION=1
  _pupitre_cwd() { printf '\e]7;file://%%s%%s\a' "${HOSTNAME:-}" "${PWD// /%%20}"; }
  _pupitre_precmd() {
    local code=$?
    printf '\e]133;D;%%s\a' "$code"
    _pupitre_cwd
    printf '\e]133;A\a'
    _pupitre_running=
    [[ $PS1 == *'\e]133;B'* ]] || PS1="${PS1}\[\e]133;B\a\]"
  }
  _pupitre_preexec() {
    [[ -n ${_pupitre_running:-} || $BASH_COMMAND == _pupitre_precmd* ]] && return
    _pupitre_running=1
    printf '\e]133;C\a'
  }
  PROMPT_COMMAND="_pupitre_precmd${PROMPT_COMMAND:+;$PROMPT_COMMAND}"
  trap '_pupitre_preexec' DEBUG
fi
`

const tmuxConf = `set -g default-terminal "tmux-256color"
set -ga terminal-overrides ",xterm-256color:Tc,xterm-ghostty:Tc"
set -g mouse on
set -g history-limit 50000
set -g base-index 1
setw -g pane-base-index 1
set -g renumber-windows on
set -sg escape-time 10
set -g status-left ' #S '
set -g status-right ' %H:%M '
bind r source-file ~/.tmux.conf \; display "tmux reloaded"
`

func zshrcBlock(projectsDir string) []byte {
	return []byte(fmt.Sprintf(zshrcBlockTemplate, shellQuote(projectsDir)))
}

func bashrcBlock(projectsDir string) []byte {
	return []byte(fmt.Sprintf(bashrcBlockTemplate, shellQuote(projectsDir)))
}

func gitIdentity(name, email string) []byte {
	return []byte(fmt.Sprintf("[user]\n\tname = %s\n\temail = %s\n", gitQuote(name), gitQuote(email)))
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", `'\''`) + "'"
}

func gitQuote(value string) string {
	escaped := strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(value)

	return `"` + escaped + `"`
}
