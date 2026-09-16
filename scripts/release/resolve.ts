import { spawnSync } from "node:child_process"
import { appVersion } from "./check"
import { argumentOf, say, VARIABLES } from "./cli"

/**
 * What a release is, read from git and the app's manifest, nothing else.
 *
 * The version is the one the app declares — `next` wrote it there, and `ship`
 * tags it before the runners build it. Every release leaves from `staging`:
 * the tag is cut there, and the same run merges the branch into `main` once
 * what it built is downloadable. The channel is `stable` unless the caller
 * says otherwise: nobody tries a version in between.
 */

export const RELEASE_BRANCH = "staging"

const DEFAULT_CHANNEL = "stable"

export interface Release {
  version: string
  channel: string
}

const TAG_RE = /^v(\d+\.\d+\.\d+)$/

const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)$/

export function versionOfTag(tag: string): string | null {
  return tag.match(TAG_RE)?.[1] ?? null
}

export function git(argv: string[], cwd?: string): string | null {
  const result = spawnSync("git", argv, { cwd, encoding: "utf8" })

  return result.status === 0 ? result.stdout.trim() : null
}

function lines(output: string | null): string[] {
  return (output ?? "").split("\n").filter(Boolean)
}

/**
 * A runner checks a tag out detached: the release branch then has to hold
 * the commit, since a tag cut anywhere else is not a release.
 */
export function onReleaseBranch(head: string, holds: () => boolean): boolean {
  return head === RELEASE_BRANCH || (head === "HEAD" && holds())
}

function currentHead(): string {
  return git(["rev-parse", "--abbrev-ref", "HEAD"]) ?? ""
}

function releaseBranchHoldsHead(): boolean {
  return (
    git([
      "merge-base",
      "--is-ancestor",
      "HEAD",
      `refs/remotes/origin/${RELEASE_BRANCH}`,
    ]) !== null
  )
}

/**
 * The v* tags origin holds, asked of the remote itself: a tag only exists as
 * a release once it is pushed, since the runners build from origin and nothing
 * else. A local tag is at most a release stopped on its way.
 */
export function originTags(cwd?: string): Set<string> {
  const listed = git(
    ["ls-remote", "--tags", "--refs", "origin", "refs/tags/v*"],
    cwd
  )

  if (listed === null) {
    throw new Error("origin is out of reach: a release needs its tags.")
  }

  return new Set(
    lines(listed).map((line) => line.slice(line.indexOf("refs/tags/") + 10))
  )
}

/** The highest v* tag reachable from HEAD that origin holds, or nothing before the first release. */
export function lastVersion(held: Set<string>, cwd?: string): string | null {
  const reachable = lines(
    git(["tag", "--list", "v*", "--merged", "HEAD", "--sort=-v:refname"], cwd)
  )
  const released = reachable.find((tag) => held.has(tag))

  return released ? versionOfTag(released) : null
}

/** The v* tag on HEAD that origin does not hold: a release stopped between its tag and its push. */
export function pendingVersion(held: Set<string>, cwd?: string): string | null {
  const pending = lines(
    git(["tag", "--points-at", "HEAD", "--list", "v*"], cwd)
  ).find((tag) => !held.has(tag))

  return pending ? versionOfTag(pending) : null
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

  const head = currentHead()

  if (!onReleaseBranch(head, releaseBranchHoldsHead)) {
    throw new Error(
      `${head} is not ${RELEASE_BRANCH}: nothing is released from there.`
    )
  }

  return {
    channel:
      argumentOf(argv, "channel") ?? env[VARIABLES.channel] ?? DEFAULT_CHANNEL,
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
  ].join("\n")
}

export function resolveCommand(argv: readonly string[]): void {
  const release = resolve(argv)

  say(formatRelease(release, argumentOf(argv, "format") ?? "env"))
}
