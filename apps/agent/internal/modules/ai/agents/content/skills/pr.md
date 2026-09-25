---
name: pr
description: Open a GitHub pull request for the current branch with gh — title and description in the repository's convention, branch pushed beforehand. Use it when asked for a PR, a merge request, or to "propose" a change rather than push it to main.
---

# pr

Open a pull request for the current branch.

## Usage

What the request may carry; `pr` is this skill, not a shell command.

    pr                        title and description derived from the commits
    pr <title>                this title
    pr --base <branch>        target a base other than the default branch
    pr --draft                a draft

## Prerequisites, to check before anything else

    gh auth status            gh is logged in when the owner installed the GitHub tool
    git status -sb            the current branch is not main

If you are on `main`, go through the `branch` skill first. If the tree carries
uncommitted changes, go through the `ship` skill first — a PR only describes what
is committed and pushed.

## Procedure

1. **Push if needed.** `git push -u origin <branch>` if the branch has no remote
   tracking. Never `--force`.

2. **Read what the PR contains.**

       git log --format='%s%n%n%b' <base>..HEAD
       git diff --stat <base>...HEAD

   The default base is the one from `gh repo view --json defaultBranchRef`.

3. **The title**: a commit subject, in the repository's language and convention.
   A single-commit PR reuses its subject.

4. **The description**, in markdown, short, in this order:
   - what it changes, in two or three sentences;
   - why, if the diff does not say it;
   - how to check: the `dev` command or the URL to open, and a screenshot
     (`shot`) when it is visual — see the `capture` skill.

   No list of files, no generated footer.

5. **Create it.**

       gh pr create --base <base> --title "<title>" --body-file - <<'PR'
       …
       PR

   Add `--draft` if asked.

## Report

The PR's URL, alone on its last line.
