import { NOTES_LOCALE, readEntry } from "../release-notes"
import { hasFlag, say } from "./cli"
import { git, RELEASE_BRANCH, resolve } from "./resolve"
import { run } from "./shell"

/**
 * The end of a release: `staging` goes into `main` by a pull request, merged
 * with a merge commit and nothing else — a squash or a rebase would leave the
 * tagged commit out of `main`, and the next version would count from the
 * wrong tag. It runs once everything the version names is downloadable, so
 * the site and the console that rebuild from `main` find what they name.
 *
 * A pull request left open by a previous run is reused; a `main` that already
 * holds the tag has nothing to do.
 */

const MAIN = "main"

function gh(argv: readonly string[], dryRun: boolean): string {
  return run(["gh", ...argv], { capture: true, dryRun }).trim()
}

export function pullRequestTitle(version: string): string {
  return `release: v${version}`
}

export function mergeCommand(argv: readonly string[]): void {
  const dryRun = hasFlag(argv, "dry-run")
  const release = resolve(argv)
  const tag = `v${release.version}`

  if (
    git(["merge-base", "--is-ancestor", tag, `refs/remotes/origin/${MAIN}`]) !==
    null
  ) {
    say(`${MAIN} already holds ${tag}: nothing to merge.`)

    return
  }

  const title = pullRequestTitle(release.version)
  const open = gh(
    [
      "pr",
      "list",
      "--base",
      MAIN,
      "--head",
      RELEASE_BRANCH,
      "--state",
      "open",
      "--json",
      "url",
      "--jq",
      ".[0].url",
    ],
    dryRun
  )
  const pullRequest =
    open ||
    gh(
      [
        "pr",
        "create",
        "--base",
        MAIN,
        "--head",
        RELEASE_BRANCH,
        "--title",
        title,
        "--body",
        readEntry(NOTES_LOCALE, release.version).body,
      ],
      dryRun
    )

  gh(["pr", "merge", pullRequest, "--merge", "--subject", title], dryRun)
  say(`${tag} is on ${MAIN}: ${pullRequest}`)
}
