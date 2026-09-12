import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { hasFlag, say } from "./cli"
import { run } from "./shell"

/**
 * The runners' secrets, from the template the chain declares: every 1Password
 * reference in it is read once and set as a repository secret, under the
 * name the workflow gives back to the steps. The plain lines are
 * not copied anywhere — the workflow reads them from the template itself, so
 * an address changes in one file.
 *
 * Run it after a value is rotated in the note. Nothing is printed but names.
 */

export const TEMPLATE = path.resolve(import.meta.dir, "release.env.tpl")

const LINE_RE = /^([A-Z][A-Z0-9_]*)=(.*)$/

const QUOTES_RE = /^"(.*)"$/

export interface TemplateLine {
  name: string
  value: string
  secret: boolean
}

export function parseTemplate(source: string): TemplateLine[] {
  const lines: TemplateLine[] = []

  for (const raw of source.split("\n")) {
    const match = raw.trim().match(LINE_RE)

    if (!match) {
      continue
    }

    const value = (match[2] as string).replace(QUOTES_RE, "$1")

    lines.push({
      name: match[1] as string,
      secret: value.startsWith("op://"),
      value,
    })
  }

  return lines
}

function setSecret(name: string, reference: string, dryRun: boolean): void {
  const value = run(["op", "read", "--no-newline", reference], {
    capture: true,
    dryRun,
  })

  say(`$ gh secret set ${name}`)

  if (dryRun) {
    return
  }

  const result = spawnSync("gh", ["secret", "set", name], {
    input: value,
    stdio: ["pipe", "inherit", "inherit"],
  })

  if (result.status !== 0) {
    throw new Error(`gh secret set ${name} exited with ${result.status}`)
  }
}

export function secretsCommand(argv: readonly string[]): void {
  const dryRun = hasFlag(argv, "dry-run")
  const lines = parseTemplate(readFileSync(TEMPLATE, "utf8"))

  for (const line of lines.filter((one) => one.secret)) {
    setSecret(line.name, line.value, dryRun)
  }

  say(
    `${lines.filter((one) => one.secret).length} secrets set; the workflow reads ${lines
      .filter((one) => !one.secret)
      .map((one) => one.name)
      .join(", ")} from the template.`
  )
}
