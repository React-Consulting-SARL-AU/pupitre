import { setTimeout as sleep } from "node:timers/promises"
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
 * `main` has no protection on GitHub's side, so the merge itself is the gate:
 * it waits for the CI job on the pull request's head commit and refuses to
 * merge unless that job succeeded — a head nobody checked is refused too.
 *
 * A pull request left open by a previous run is reused; a `main` that already
 * holds the tag has nothing to do.
 */

const MAIN = "main"

const CI_JOB = "Quality"

const CHECKS_POLL_MS = 10_000

const CHECKS_TIMEOUT_MS = 5 * 60_000

export interface CheckRun {
  id: number
  name: string
  status: string
  conclusion: string | null
}

export type CiVerdict =
  | { state: "passed" }
  | { state: "pending" }
  | { state: "missing" }
  | { state: "failed"; reason: string }

function gh(argv: readonly string[], dryRun: boolean): string {
  return run(["gh", ...argv], { capture: true, dryRun }).trim()
}

export function pullRequestTitle(version: string): string {
  return `release: v${version}`
}

/** `Quality` from a pull request run, `CI / Quality` when `release.yml` calls it. */
function isCiJob(name: string): boolean {
  return name === CI_JOB || name.endsWith(` / ${CI_JOB}`)
}

function latestCiRuns(runs: readonly CheckRun[]): CheckRun[] {
  const latest = new Map<string, CheckRun>()

  for (const checkRun of runs) {
    if (!isCiJob(checkRun.name)) {
      continue
    }

    const seen = latest.get(checkRun.name)

    if (!seen || checkRun.id > seen.id) {
      latest.set(checkRun.name, checkRun)
    }
  }

  return [...latest.values()]
}

export function ciVerdict(runs: readonly CheckRun[]): CiVerdict {
  const ciRuns = latestCiRuns(runs)

  if (ciRuns.length === 0) {
    return { state: "missing" }
  }

  const failed = ciRuns.find(
    (checkRun) =>
      checkRun.status === "completed" && checkRun.conclusion !== "success"
  )

  if (failed) {
    return { reason: `${failed.name}: ${failed.conclusion}`, state: "failed" }
  }

  if (ciRuns.some((checkRun) => checkRun.status !== "completed")) {
    return { state: "pending" }
  }

  return { state: "passed" }
}

function checkRunsOf(sha: string): CheckRun[] {
  const listed = gh(
    [
      "api",
      `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`,
      "--jq",
      ".check_runs | map({id, name, status, conclusion})",
    ],
    false
  )

  return JSON.parse(listed) as CheckRun[]
}

async function awaitCi(sha: string): Promise<void> {
  const deadline = Date.now() + CHECKS_TIMEOUT_MS

  for (;;) {
    const verdict = ciVerdict(checkRunsOf(sha))

    if (verdict.state === "passed") {
      say(`CI passed on ${sha}.`)

      return
    }

    if (verdict.state === "failed") {
      throw new Error(
        `CI failed on ${sha} (${verdict.reason}): ${MAIN} is left as it is.`
      )
    }

    if (Date.now() >= deadline) {
      throw new Error(
        verdict.state === "missing"
          ? `No CI check reported on ${sha}: ${RELEASE_BRANCH} holds commits nobody checked, and ${MAIN} is left as it is.`
          : `CI still running on ${sha} after ${CHECKS_TIMEOUT_MS / 60_000} minutes: ${MAIN} is left as it is, run merge again once it is done.`
      )
    }

    say(`CI ${verdict.state} on ${sha}, asking again shortly.`)
    await sleep(CHECKS_POLL_MS)
  }
}

export async function mergeCommand(argv: readonly string[]): Promise<void> {
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
  const head = gh(
    ["pr", "view", pullRequest, "--json", "headRefOid", "--jq", ".headRefOid"],
    dryRun
  )

  if (!dryRun) {
    await awaitCi(head)
  }

  gh(
    [
      "pr",
      "merge",
      pullRequest,
      "--merge",
      "--match-head-commit",
      head,
      "--subject",
      title,
    ],
    dryRun
  )
  say(`${tag} is on ${MAIN}: ${pullRequest}`)
}
