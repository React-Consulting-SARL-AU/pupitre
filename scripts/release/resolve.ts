import { spawnSync } from "node:child_process"
import { argumentOf, say, VARIABLES } from "./cli"

/**
 * What a release is, read from git and nothing else.
 *
 * The version is the tag at HEAD; the branch that carries HEAD names the
 * platform the version is declared to — `main` speaks to production, `staging`
 * to staging — and a tag on any other branch releases nothing. The channel is
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

export function versionOfTag(tag: string): string | null {
  return tag.match(TAG_RE)?.[1] ?? null
}

/** The platform of a branch, from the two addresses the environment carries. */
export function platformFor(
  branch: Branch,
  env: NodeJS.ProcessEnv
): string | null {
  const key = branch === "main" ? VARIABLES.platform : VARIABLES.stagingPlatform

  return env[key] || null
}

function git(argv: string[]): string | null {
  const result = spawnSync("git", argv, { encoding: "utf8" })

  return result.status === 0 ? result.stdout.trim() : null
}

/** The first of `main` and `staging` that contains HEAD; `main` wins, it contains everything. */
export function branchOfHead(): Branch | null {
  for (const branch of BRANCHES) {
    git([
      "fetch",
      "--no-tags",
      "--quiet",
      "origin",
      `+refs/heads/${branch}:refs/remotes/origin/${branch}`,
    ])

    if (
      git(["merge-base", "--is-ancestor", "HEAD", `origin/${branch}`]) !== null
    ) {
      return branch
    }
  }

  return null
}

export function versionAtHead(): string | null {
  const tags = git(["tag", "--points-at", "HEAD", "--list", "v*"])

  if (!tags) {
    return null
  }

  const versions = tags
    .split("\n")
    .map(versionOfTag)
    .filter((one): one is string => one !== null)

  return versions[0] ?? null
}

export function resolve(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Release {
  const version = argumentOf(argv, "version") ?? versionAtHead()

  if (!version) {
    throw new Error(
      "HEAD carries no v* tag and --version was not given: nothing to release."
    )
  }

  const branch = branchOfHead()

  if (!branch) {
    throw new Error(
      `${version} is neither on main nor on staging: nothing is released from there.`
    )
  }

  const platform = platformFor(branch, env)

  if (!platform) {
    throw new Error(
      `${branch} has no platform: set ${branch === "main" ? VARIABLES.platform : VARIABLES.stagingPlatform}.`
    )
  }

  return {
    branch,
    channel: argumentOf(argv, "channel") ?? env[VARIABLES.channel] ?? "beta",
    platform,
    version,
  }
}

/** The lines a runner appends to its environment file, or a JSON document. */
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
