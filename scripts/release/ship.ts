import { hasFlag, say } from "./cli"
import { git, originTags, RELEASE_BRANCH, resolve } from "./resolve"
import { run } from "./shell"

const RELEASE_PATHS = [
  "apps/desktop/package.json",
  "apps/site/src/content/changelog",
]

export type TagPlan = "tag" | "push"

// A push refused by the pre-push hook leaves the tag on HEAD, so a rerun only pushes.
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
