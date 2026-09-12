import { spawnSync } from "node:child_process"
import { appVersion } from "./check"
import { argumentOf, say, VARIABLES } from "./cli"

/**
 * What a release is, read from git and the app's manifest, nothing else.
 *
 * The version is the one the app declares — `next` wrote it there, and `ship`
 * tags it before the runners build it. The branch the tag sits on names the
 * platform the version is declared to: `main` speaks to production, `staging`
 * to staging, and nothing is released from anywhere else. The channel is
 * `beta` unless the caller says otherwise: a version always goes out to be
 * tried, and `promote` is what makes it stable.
 */

export const BRANCHES = ["main", "staging"] as const

export type Branch = (typeof BRANCHES)[number]

export interface Release {
  version: string
  channel: string
  branch: Branch
  platform: string
}

const TAG_RE = /^v(\d+\.\d+\.\d+)$/

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/

export function versionOfTag(tag: string): string | null {
  return tag.match(TAG_RE)?.[1] ?? null
}

/** The platform of a branch, from the two addresses the environment carries. */
export function platformFor(
  branch: Branch,
  env: NodeJS.ProcessEnv
): string | null {
  const key =
    branch === "main" ? VARIABLES.productionPlatform : VARIABLES.stagingPlatform

  return env[key] || null
}

export function git(argv: string[]): string | null {
  const result = spawnSync("git", argv, { encoding: "utf8" })

  return result.status === 0 ? result.stdout.trim() : null
}

/**
 * A runner checks a tag out detached: the branch is then the one that holds
 * the commit, staging before main, since every commit of staging reaches
 * main by the merge and a tag cut on staging stays a staging release.
 */
export function branchHolding(
  head: string,
  holds: (branch: Branch) => boolean
): Branch | null {
  const named = BRANCHES.find((branch) => branch === head)

  if (named) {
    return named
  }

  if (head !== "HEAD") {
    return null
  }

  return (["staging", "main"] as const).find(holds) ?? null
}

export function currentBranch(): Branch | null {
  return branchHolding(
    git(["rev-parse", "--abbrev-ref", "HEAD"]) ?? "",
    (branch) =>
      git([
        "merge-base",
        "--is-ancestor",
        "HEAD",
        `refs/remotes/origin/${branch}`,
      ]) !== null
  )
}

/** The highest v* tag reachable from HEAD, or nothing before the first release. */
export function lastVersion(): string | null {
  const described = git(["describe", "--tags", "--abbrev=0", "--match", "v*"])

  return described ? versionOfTag(described) : null
}

export function bump(
  version: string,
  part: "major" | "minor" | "patch"
): string {
  const match = version.match(VERSION_RE)

  if (!match) {
    throw new Error(`${version} is not a semver version.`)
  }

  const [major, minor, patch] = match.slice(1).map(Number) as [
    number,
    number,
    number,
  ]

  switch (part) {
    case "major":
      return `${major + 1}.0.0`
    case "minor":
      return `${major}.${minor + 1}.0`
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

export function resolve(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Release {
  const version = argumentOf(argv, "version") ?? appVersion()

  if (!VERSION_RE.test(version)) {
    throw new Error(
      `apps/desktop/package.json declares "${version}", which is not a version.`
    )
  }

  const branch = currentBranch()

  if (!branch) {
    throw new Error(
      `${git(["rev-parse", "--abbrev-ref", "HEAD"])} is neither main nor staging: nothing is released from there.`
    )
  }

  const platform = platformFor(branch, env)

  if (!platform) {
    throw new Error(
      `${branch} has no platform: set ${branch === "main" ? VARIABLES.productionPlatform : VARIABLES.stagingPlatform}.`
    )
  }

  return {
    branch,
    channel: argumentOf(argv, "channel") ?? env[VARIABLES.channel] ?? "beta",
    platform,
    version,
  }
}

/** The lines a shell exports, or a JSON document. */
export function formatRelease(release: Release, format: string): string {
  if (format === "json") {
    return JSON.stringify(release)
  }

  return [
    `${VARIABLES.version}=${release.version}`,
    `${VARIABLES.channel}=${release.channel}`,
    `${VARIABLES.platform}=${release.platform}`,
    `PUPITRE_RELEASE_BRANCH=${release.branch}`,
  ].join("\n")
}

export function resolveCommand(argv: readonly string[]): void {
  const release = resolve(argv)

  say(formatRelease(release, argumentOf(argv, "format") ?? "env"))
}
