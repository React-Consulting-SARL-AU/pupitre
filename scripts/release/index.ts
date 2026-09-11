import { agentCommand } from "./agent"
import { appCommand } from "./app"
import { checkCommand } from "./check"
import { desktopCommand } from "./desktop"
import { promoteCommand } from "./promote"
import { resolveCommand } from "./resolve"

/**
 * The release chain, one step per command, each runnable anywhere the tools
 * and the variables are: a GitHub runner today, a machine of ours tomorrow.
 *
 *   resolve            the version, channel, branch and platform, from git
 *   check              the changelog and the app version, before any build
 *   agent build        garble, sign, smoke the agent
 *   agent publish      the private bucket, then the platform of the branch
 *   desktop            build the app on this system, stage it in the private bucket
 *   app publish        sign every installer, the public bucket, the platform
 *   promote            declare to production and move a version to a channel
 *
 * `--dry-run` prints what would run. A secret is only ever read from the
 * environment, never from a flag.
 */

const USAGE =
  "usage: bun scripts/release/index.ts <resolve|check|agent|desktop|app|promote> [...] [--dry-run]"

async function main(argv: readonly string[]): Promise<void> {
  const [command, ...rest] = argv

  switch (command) {
    case "resolve":
      resolveCommand(rest)
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
