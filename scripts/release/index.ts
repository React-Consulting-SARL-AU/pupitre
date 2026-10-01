import { agentCommand } from "./agent"
import { appCommand } from "./app"
import { checkCommand } from "./check"
import { desktopCommand } from "./desktop"
import { githubReleaseCommand } from "./github-release"
import { mergeCommand } from "./merge"
import { nextCommand } from "./next"
import { notesCommand } from "./notes"
import { promoteCommand } from "./promote"
import { resolveCommand } from "./resolve"
import { secretsCommand } from "./secrets"
import { shipCommand } from "./ship"
import { verifyCommand } from "./verify"

const USAGE =
  "usage: bun scripts/release/index.ts <next|resolve|notes|check|ship|agent|desktop|app|verify|github-release|merge|promote|secrets> [...] [--dry-run]"

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
      await mergeCommand(rest)
      return
    case "github-release":
      await githubReleaseCommand(rest)
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
