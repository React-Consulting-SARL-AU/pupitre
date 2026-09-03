---
name: ship
description: Commit and push the work in progress on the current branch — one commit whose message follows the repository's convention, then a push. Use it when asked to commit, to push, to save the changes or to "ship". To start on a new branch, see the branch skill; to open a pull request, the pr skill.
---

# ship

Commit the working tree and push it, on the branch you are already on.

## Usage

    ship                      commit everything modified, then push
    ship <message>            this subject (or these instructions) for the message
    ship <path> [path…]       only these files
    ship --no-push            commit only, nothing leaves

## Who does the work

**Claude Code**: delegate entirely to the `git-shipper` subagent — a single
`Agent` call, `subagent_type: "git-shipper"`, `run_in_background: false`. Pass it
the repository path, the scope (files, or "everything modified"), whether to
push, the dictated message if there is one, and one or two lines about the *why*
of the change when it cannot be read from the diff. Do not re-read the diff nor
rerun `git log` after it: report the branch, the subject and the push result,
that is all.

**Codex and the other agents**: follow the procedure below yourself.

## Procedure

### 1. Read before writing

In one batch:

    git status --porcelain=v1 --branch
    git diff --stat HEAD
    git log -15 --format='%s'
    git log -4 --format='%B'

The last two give the style to imitate: the language, the conventional prefixes
and scopes (`feat(sessions):`, `fix:`, `docs:`…), the length of the subjects, the
presence and tone of bodies. Never invent a convention the repository does not
have, and never a `Co-Authored-By` or "generated with" footer if the log does not
carry one.

Also read the repository's `CLAUDE.md` or `AGENTS.md` if it exists: it may carry
commit rules that take precedence over these.

### 2. Stage the right files

The user edits the tree in parallel. **Never `git add -A`, `git add .` or
`git commit -a`.**

Take the list from the `git status --porcelain` you already read and stage those
exact paths: `git add -- <path> <path>…`. Untracked files count, but skip
anything that obviously has no business in the commit — `.env*`, credentials,
build artefacts, `node_modules`, scratch files, editor junk — and say in the
report what was skipped.

If a scope was given: stage only that. Clean tree: stop and say so.

### 3. The message

Subject only when the change is a single obvious thing. A body when it carries a
decision, a constraint or a non-obvious reason: explain the *why*, not the list
of files touched. Read the staged diff (`git diff --cached`) before writing —
never a message from file names alone.

The commit is written with a heredoc, so the body keeps its line breaks:

    git commit -F - <<'MSG'
    subject

    body
    MSG

### 4. Push

Only if asked (which is the default, unless `--no-push`).

- Branch already tracked: `git push`
- New local branch: `git push -u origin <branch>`
- **Never** `--force`, `--force-with-lease` or `--no-verify`. A refused push
  (non-fast-forward): stop and report it, do not resolve it yourself.

### 5. The hooks

They run lint, type-checking and tests: a commit or a push can take a while and
can fail. That is a result, not an obstacle. A hook fails: report the command and
the useful output, and stop. Never a bypass flag. A formatting hook that rewrites
and re-stages files is normal.

### 6. Report

Compact, nothing else: branch, short sha, subject; pushed or not (and the remote
branch); what was skipped; what failed, with the output that proves it.
