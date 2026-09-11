import { readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { appVersion } from "./check"
import { argumentOf, say } from "./cli"
import { bump, lastVersion } from "./resolve"

/**
 * The next version, written where the app declares it.
 *
 * It follows the last tag: a patch for a fix, a minor for a feature, a major
 * when the protocol between the app and the agent drops or renames a field.
 * Nothing else changes here — the changelog is `notes`, the tag is `ship`.
 */

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
  declared: string
): string {
  const requested = argumentOf(argv, "version")

  if (requested) {
    return requested
  }

  return last ? bump(last, partOf(argv)) : declared
}

/** The line is rewritten in place: the file keeps its formatting and its key order. */
export function writeAppVersion(version: string, manifest = MANIFEST): void {
  const source = readFileSync(manifest, "utf8")

  if (!VERSION_LINE_RE.test(source)) {
    throw new Error(`${manifest} has no "version" line.`)
  }

  writeFileSync(manifest, source.replace(VERSION_LINE_RE, `$1${version}$2`))
}

export function nextCommand(argv: readonly string[]): void {
  const last = lastVersion()
  const version = nextVersion(argv, last, appVersion())

  writeAppVersion(version)
  say(`${last ?? "no tag yet"} -> ${version} (apps/desktop/package.json)`)
}
