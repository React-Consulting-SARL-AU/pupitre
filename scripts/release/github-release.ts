import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { PUPITRE_ORIGINS } from "../../packages/shared/src/legal"
import { NOTES_LOCALE, readEntry } from "../release-notes"
import { hasFlag, say, variable } from "./cli"
import { run } from "./shell"
import { type Build, describedRelease } from "./verify"

const SYSTEMS: Readonly<Record<string, string>> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
}

const SYSTEM_ORDER = Object.keys(SYSTEMS)

const BYTES_PER_MB = 1024 * 1024

function fileName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.split("/").at(-1) ?? url)
}

function sizeOf(bytes: number): string {
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`
}

function byPlatform(left: Build, right: Build): number {
  return (
    SYSTEM_ORDER.indexOf(left.os) - SYSTEM_ORDER.indexOf(right.os) ||
    left.arch.localeCompare(right.arch) ||
    left.format.localeCompare(right.format)
  )
}

export function githubReleaseNotes(
  notes: string,
  builds: readonly Build[]
): string {
  const rows = [...builds]
    .sort(byPlatform)
    .map(
      (build) =>
        `| ${SYSTEMS[build.os] ?? build.os} | ${build.arch} | [${fileName(build.url)}](${build.url}) | ${sizeOf(build.bytes)} |`
    )

  return [
    notes.trim(),
    "",
    "## Downloads",
    "",
    "| System | Architecture | File | Size |",
    "| --- | --- | --- | --- |",
    ...rows,
    "",
    "Every file is signed with the release key, and the installed app refuses an update without its signature. The agent is not attached: the app installs and updates it on each server.",
    "",
    `All versions and instructions: ${PUPITRE_ORIGINS.site}/download/`,
    "",
  ].join("\n")
}

// GitHub only mirrors what the bucket and the platform already serve: it runs once both are verified.
export async function githubReleaseCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const dryRun = hasFlag(argv, "dry-run")
  const version = variable(env, "version")
  const channel = variable(env, "channel")
  const tag = `v${version}`
  const entry = readEntry(NOTES_LOCALE, version)
  const release = await describedRelease(variable(env, "platform"), version)
  const notesFile = path.join(
    mkdtempSync(path.join(tmpdir(), "pupitre-release-")),
    "notes.md"
  )

  writeFileSync(notesFile, githubReleaseNotes(entry.body, release.builds))

  const published = (() => {
    try {
      run(["gh", "release", "view", tag, "--json", "tagName"], {
        capture: true,
        dryRun,
      })

      return !dryRun
    } catch {
      return false
    }
  })()
  const stability = channel === "stable" ? ["--latest"] : ["--prerelease"]

  run(
    published
      ? [
          "gh",
          "release",
          "edit",
          tag,
          "--title",
          entry.title,
          "--notes-file",
          notesFile,
          ...stability,
        ]
      : [
          "gh",
          "release",
          "create",
          tag,
          "--verify-tag",
          "--title",
          entry.title,
          "--notes-file",
          notesFile,
          ...stability,
        ],
    { dryRun }
  )
  say(
    `${tag} is on GitHub Releases, ${release.builds.length} downloads linked.`
  )
}
