# =============================================================================
#  pupitre.zsh — shell integration for Pupitre.
#
#  Tells the terminal where the prompt starts, where input starts, when the
#  command leaves and when it finishes, and which folder we are in. These are
#  the OSC 133 (FinalTerm) and OSC 7 sequences, which Ghostty, Kitty, WezTerm,
#  iTerm2 and VS Code also understand; a terminal that does not know them
#  ignores them without displaying anything.
#
#  That is what lets Pupitre know what is being typed — and therefore offer
#  completion — without ever guessing from what is on screen.
#
#  Installed by bootstrap.sh as /etc/dev-stack.integration.zsh, sourced at the
#  end of ~/.zshrc.
# =============================================================================

[[ -o interactive ]] || return 0
[[ -n ${PUPITRE_INTEGRATION:-} ]] && return 0
PUPITRE_INTEGRATION=1

autoload -Uz add-zsh-hook

_pupitre_cwd() {
  printf '\e]7;file://%s%s\a' "${HOST:-}" "${PWD// /%20}"
}

_pupitre_precmd() {
  local code=$?
  printf '\e]133;D;%s\a' "$code"
  _pupitre_cwd
  printf '\e]133;A\a'
  [[ $PS1 == *$'\e]133;B'* ]] || PS1="${PS1}%{"$'\e]133;B\a'"%}"
}

_pupitre_preexec() {
  printf '\e]133;C\a'
}

add-zsh-hook precmd _pupitre_precmd
add-zsh-hook preexec _pupitre_preexec
