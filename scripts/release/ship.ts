import { hasFlag, say } from "./cli"
import { git, originTags, RELEASE_BRANCH, resolve } from "./resolve"
import { run } from "./shell"

/**
 * The last gesture on this machine: what the release changed in the
 * repository — the version the app declares and the changelog — is committed,
 * the version is tagged, and both go to the remote. The tag is what the
 * runners pick up; from here the release is theirs, up to the merge.
 *
 * A push the pre-push hook refused leaves the commit and the tag behind:
 * run again, the step finds them on HEAD, absent from origin, and pushes.
 */

const RELEASE_PATHS = [
  "apps/desktop/package.json",
  "apps/site/src/content/changelog",
]

export type TagPlan = "tag" | "push"

/** Whether the tag is still to cut, or cut on HEAD and only waiting for its push. */
export function tagPlan(
  tag: string,
  tagged: string | null,
  head: string
): TagPlan {
  if (tagged === null) {
    return "tag"
  }

  if (tagged !== head) {
    throw new Error(
      `${tag} already exists on another commit: a version is tagged once.`
    )
  }

  return "push"
}

export function shipCommand(argv: readonly string[]): void {
  const dryRun = hasFlag(argv, "dry-run")
  const release = resolve(argv)
  const tag = `v${release.version}`

  if (originTags().has(tag)) {
    throw new Error(`${tag} is already on origin: a version is tagged once.`)
  }

  const changed = git(["status", "--porcelain", "--", ...RELEASE_PATHS]) ?? ""

  if (changed) {
    run(["git", "add", ...RELEASE_PATHS], { dryRun })
    run(["git", "commit", "-m", `chore(release): ${tag}`], { dryRun })
  } else {
    say("nothing to commit: the version and the notes are already in.")
  }

  const plan = tagPlan(
    tag,
    git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}^{commit}`]),
    git(["rev-parse", "HEAD"]) ?? ""
  )

  if (plan === "tag") {
    run(["git", "tag", "-a", tag, "-m", `Pupitre ${release.version}`], {
      dryRun,
    })
  } else {
    say(`${tag} is on HEAD and not on origin yet: pushing it.`)
  }

  run(["git", "push", "origin", RELEASE_BRANCH], { dryRun })
  run(["git", "push", "origin", tag], { dryRun })
  say(
    `${tag} is on ${RELEASE_BRANCH}: the runners build, publish and merge it.`
  )
}
