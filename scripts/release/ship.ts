import { hasFlag, say } from "./cli"
import { git, resolve } from "./resolve"
import { run } from "./shell"

/**
 * The last gesture: what the release changed in the repository — the version
 * the app declares and the changelog — is committed, the version is tagged,
 * and both go to the remote. It comes after the publication on purpose: when
 * the site and the console rebuild from this push, every file they will name
 * is already downloadable.
 */

export function shipCommand(argv: readonly string[]): void {
  const dryRun = hasFlag(argv, "dry-run")
  const release = resolve(argv)
  const tag = `v${release.version}`
  const changed = git(["status", "--porcelain"]) ?? ""

  if (changed) {
    run(
      [
        "git",
        "add",
        "apps/desktop/package.json",
        "apps/site/src/content/changelog",
      ],
      { dryRun }
    )
    run(["git", "commit", "-m", `chore(release): ${tag}`], { dryRun })
  } else {
    say("nothing to commit: the version and the notes are already in.")
  }

  if (git(["rev-parse", "--verify", "--quiet", `refs/tags/${tag}`]) !== null) {
    throw new Error(`${tag} already exists: a version is tagged once.`)
  }

  run(["git", "tag", "-a", tag, "-m", `Pupitre ${release.version}`], { dryRun })
  run(["git", "push", "origin", release.branch], { dryRun })
  run(["git", "push", "origin", tag], { dryRun })
  say(`${tag} is on ${release.branch}, published to ${release.platform}`)
}
