import { agentCommand } from "./agent"
import { appCommand } from "./app"
import { checkCommand } from "./check"
import { desktopCommand } from "./desktop"
import { mergeCommand } from "./merge"
import { nextCommand } from "./next"
import { notesCommand } from "./notes"
import { promoteCommand } from "./promote"
import { resolveCommand } from "./resolve"
import { secretsCommand } from "./secrets"
import { shipCommand } from "./ship"
import { verifyCommand } from "./verify"

/**
 * The release chain, one step per command. The owner's Mac runs the first
 * four and `ship` — `scripts/release.sh` strings them together — and the tag
 * it pushes has the runners of `.github/workflows/release.yml` run the rest,
 * up to the merge into `main`, with the secrets `secrets` gave them. The same
 * commands run the same way on a machine of ours the day the runners are ours.
 *
 *   next               the next version, written in the app's manifest
 *   resolve            the version and the channel, from git and the manifest
 *   notes              the changelog entry drafted by Claude, for the owner to read
 *   check              the changelog and the app version, before any build
 *   ship               commit the version and the notes, tag, push
 *   agent build        garble, sign, smoke the agent — or take a version already built
 *   agent smoke        try the binaries in place on this machine's architecture
 *   agent publish      the private bucket, then the platform
 *   desktop            build the app of this system into the private bucket
 *   app publish        sign every installer, the public bucket, the platform
 *   verify             what a customer can download, checked from outside
 *   merge              the pull request staging → main, merged by a merge commit
 *   promote            move a published version to a channel — the way back
 *   secrets            the template's 1Password references, set as repository secrets
 *
 * `--dry-run` prints what would run. A secret is only ever read from the
 * environment, never from a flag.
 */

const USAGE =
  "usage: bun scripts/release/index.ts <next|resolve|notes|check|ship|agent|desktop|app|verify|merge|promote|secrets> [...] [--dry-run]"

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv

  switch (command) {
    case "next":
      nextCommand(rest)
      return
    case "resolve":
      resolveCommand(rest)
      return
    case "notes":
      notesCommand(rest)
      return
    case "ship":
      shipCommand(rest)
      return
    case "check":
      checkCommand()
      return
    case "agent":
      await agentCommand(rest)
      return
    case "desktop":
      await desktopCommand(rest)
      return
    case "app":
      await appCommand(rest)
      return
    case "verify":
      await verifyCommand()
      return
    case "merge":
      mergeCommand(rest)
      return
    case "promote":
      await promoteCommand(rest)
      return
    case "secrets":
      secretsCommand(rest)
      return
    default:
      throw new Error(USAGE)
  }
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`
    )
    process.exit(1)
  })
}
