---
name: branch
description: Move the work in progress onto a new git branch, commit it and push it, in one step. Use it when asked for a branch for these changes, or to "create a branch, commit and push". To stay on the current branch, see the ship skill.
---

# branch

Move the work in progress onto a fresh branch and push it.

## Usage

What the request may carry; `branch` is this skill, not a shell command.

    branch                       the name is derived from the change
    branch <name>                this name
    branch <name> <message>      and this commit subject
    branch --from main           start from this base rather than the current HEAD

## Who does the work

**Claude Code**: delegate to the `git-shipper` subagent (one `Agent` call,
`subagent_type: "git-shipper"`, `run_in_background: false`), giving it the steps
below in order, the file scope, the dictated message if there is one, and one or
two lines of *why*.

**Codex and the other agents**: follow the procedure yourself.

## Procedure

1. **Guardrail.** If HEAD is already on a branch other than `main`, say so and
   confirm that one more branch is really wanted: branching off unpushed work is
   most often a mistake.

2. **Create the branch without losing anything.** `git switch -c <name>` — or
   `git switch -c <name> <base>` when a base was given. Working tree changes
   follow the branch switch: never `stash` nor `reset`.

3. **The name.** Given by the user: as is. Otherwise derive it from the diff, in
   the vocabulary that `git branch -a` and `git log --format='%s'` already show —
   same prefixes (`feat/`, `fix/`, `chore/`…), same separator, same language, in
   kebab-case, short.

4. **Commit and push** following the rules of the `ship` skill: read first
   (status, diff, log style), stage the exact paths and never `-A`, message in
   the repository's convention, then `git push -u origin <name>`. Never
   `--force`, never `--no-verify`.

## Report

The branch, the subject, the push result, in one or two lines. If the repository
has a GitHub remote, offer the command from the `pr` skill.
