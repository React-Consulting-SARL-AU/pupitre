import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { appVersion } from "./check"
import { argumentOf, say } from "./cli"
import { bump, lastVersion, originTags, pendingVersion } from "./resolve"

const ROOT = path.resolve(import.meta.dir, "../..")

const MANIFEST = path.join(ROOT, "apps/desktop/package.json")

const VERSION_LINE_RE = /^(\s*"version":\s*")[^"]*(")/m

export function partOf(argv: readonly string[]): "major" | "minor" | "patch" {
  if (argv.includes("--major")) {
    return "major"
  }

  if (argv.includes("--minor")) {
    return "minor"
  }

  return "patch"
}

export function nextVersion(
  argv: readonly string[],
  last: string | null,
  declared: string,
  pending: string | null = null
): string {
  const requested = argumentOf(argv, "version")

  if (requested) {
    return requested
  }

  if (pending) {
    return pending
  }

  return last ? bump(last, partOf(argv)) : declared
}

// Rewritten in place so the manifest keeps its formatting and key order.
export function writeAppVersion(version: string, manifest = MANIFEST): void {
  const source = readFileSync(manifest, "utf8")

  if (!VERSION_LINE_RE.test(source)) {
    throw new Error(`${manifest} has no "version" line.`)
  }

  writeFileSync(manifest, source.replace(VERSION_LINE_RE, `$1${version}$2`))
}

export function nextCommand(argv: readonly string[]): void {
  const held = originTags()
  const last = lastVersion(held)
  const pending = pendingVersion(held)
  const version = nextVersion(argv, last, appVersion(), pending)

  writeAppVersion(version)
  say(
    pending
      ? `v${pending} is tagged here and not on origin: resuming it (apps/desktop/package.json)`
      : `${last ?? "no tag yet"} -> ${version} (apps/desktop/package.json)`
  )
}
