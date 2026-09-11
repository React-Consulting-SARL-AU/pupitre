import { agentCommand } from "./agent"
import { appCommand } from "./app"
import { checkCommand } from "./check"
import { desktopCommand } from "./desktop"
import { nextCommand } from "./next"
import { notesCommand } from "./notes"
import { promoteCommand } from "./promote"
import { resolveCommand } from "./resolve"
import { shipCommand } from "./ship"

/**
 * The release chain, one step per command, run from the owner's Mac with the
 * secrets injected by 1Password — `scripts/release.sh` strings them together.
 *
 *   next               the next version, written in the app's manifest
 *   resolve            the version, channel, branch and platform, from git
 *   notes              the changelog entry drafted by Claude, for the owner to read
 *   check              the changelog and the app version, before any build
 *   agent build        garble, sign, smoke the agent — or take a version already built
 *   agent publish      the private bucket, then the platform of the branch
 *   desktop            build the app — all three systems from macOS — into the private bucket
 *   app publish        sign every installer, the public bucket, the platform
 *   ship               commit the version and the notes, tag, push
 *   promote            declare to production and move a version to a channel
 *
 * `--dry-run` prints what would run. A secret is only ever read from the
 * environment, never from a flag.
 */

const USAGE =
  "usage: bun scripts/release/index.ts <next|resolve|notes|check|agent|desktop|app|ship|promote> [...] [--dry-run]"

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
    case "promote":
      await promoteCommand(rest)
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
