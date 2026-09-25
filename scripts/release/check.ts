import { readFileSync } from "node:fs"
import path from "node:path"
import { checkEntries, locales } from "../release-notes"
import { say, variable } from "./cli"

const ROOT = path.resolve(import.meta.dir, "../..")

export function appVersion(root = ROOT): string {
  const manifest = JSON.parse(
    readFileSync(path.join(root, "apps/desktop/package.json"), "utf8")
  ) as { version?: string }

  return manifest.version ?? ""
}

export function checkRelease(version: string, root = ROOT): string[] {
  const failures = checkEntries(version)
  const declared = appVersion(root)

  if (declared !== version) {
    failures.push(
      `apps/desktop/package.json declares ${declared || "nothing"}, the tag says ${version}`
    )
  }

  return failures
}

export function checkCommand(env: NodeJS.ProcessEnv = process.env): void {
  const version = variable(env, "version")
  const failures = checkRelease(version)

  if (failures.length > 0) {
    throw new Error(
      `${version} cannot be released:\n${failures.map((line) => `- ${line}`).join("\n")}`
    )
  }

  say(`${version}: changelog in ${locales().join(", ")}, app version matches.`)
}
