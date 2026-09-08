import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"

export const PRODUCTION_BRANCH = "main"
export const INTEGRATION_BRANCH = "staging"
export const ESCAPE_VARIABLE = "PUPITRE_ALLOW_MAIN"

const PROTECTED_REF = `refs/heads/${PRODUCTION_BRANCH}`
const FIELDS = /\s+/

export interface TPushRef {
  localRef: string
  remoteRef: string
}

export function parsePushRefs(input: string): TPushRef[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [localRef, , remoteRef] = line.split(FIELDS)

      return { localRef: localRef ?? "", remoteRef: remoteRef ?? "" }
    })
}

export function refusedPushRefs(input: string): string[] {
  return parsePushRefs(input)
    .filter((ref) => ref.remoteRef === PROTECTED_REF)
    .map((ref) => ref.remoteRef)
}

export function refusesCommit(branch: string): boolean {
  return branch.trim() === PRODUCTION_BRANCH
}

export function isEscaped(env: Record<string, string | undefined>): boolean {
  return env[ESCAPE_VARIABLE] === "1"
}

function currentBranch(): string {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    encoding: "utf8",
  })

  return result.status === 0 ? result.stdout.trim() : ""
}

function refuse(what: string, how: string): never {
  process.stderr.write(
    `${what}\n\n${PRODUCTION_BRANCH} is the production branch: it only changes through a pull request from ${INTEGRATION_BRANCH}.\n${how}\nSet ${ESCAPE_VARIABLE}=1 for a one-off exception.\n`
  )
  process.exit(1)
}

function main(mode: string): void {
  if (isEscaped(process.env)) {
    return
  }

  if (mode === "commit") {
    if (refusesCommit(currentBranch())) {
      refuse(
        `Commit refused on ${PRODUCTION_BRANCH}.`,
        `  git switch ${INTEGRATION_BRANCH}\n  git switch -c feat/<name> ${INTEGRATION_BRANCH}`
      )
    }

    return
  }

  if (mode === "push") {
    const refused = refusedPushRefs(readFileSync(0, "utf8"))

    if (refused.length > 0) {
      refuse(
        `Push refused to ${refused.join(", ")}.`,
        `  gh pr create --base ${PRODUCTION_BRANCH} --head ${INTEGRATION_BRANCH}`
      )
    }

    return
  }

  process.stderr.write(`Unknown mode ${mode}, expected commit or push.\n`)
  process.exit(1)
}

if (import.meta.main) {
  main(process.argv[2] ?? "")
}
