import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  FEEDS,
  feedKey,
  objectKey,
} from "../../apps/desktop/scripts/release-artefacts"
import { readAgentPublications } from "./agent"
import { argumentOf, hasFlag, say, variable } from "./cli"
import {
  type AppPublication,
  declareAgent,
  declareApp,
  platformFromEnv,
  promoteAgent,
  promoteApp,
} from "./platform"
import { bucket, get, keys, put } from "./r2"
import { versionOfTag } from "./resolve"

/**
 * A version reaches production here, and only here: what `main` just took is
 * declared to the production platform from the rows kept with the artefacts —
 * the same digests, the same keys in the buckets, nothing rebuilt — then moved
 * to its channel, and the channel's feeds are pointed at it.
 *
 * Every request is idempotent, so a promotion run twice, or run by hand on a
 * version production already knows, changes nothing the second time.
 */

const LEADING_V_RE = /^v/

function git(argv: string[]): string {
  const result = spawnSync("git", argv, { encoding: "utf8" })

  return result.status === 0 ? result.stdout.trim() : ""
}

function tagsMergedInto(ref: string): string[] {
  return git(["tag", "--merged", ref, "--list", "v*"])
    .split("\n")
    .map(versionOfTag)
    .filter((one): one is string => one !== null)
}

/** The versions HEAD carries that `before` did not: what a merge brought to `main`. */
export function versionsSince(before: string | undefined): string[] {
  const after = new Set(tagsMergedInto("HEAD"))
  const known =
    before && git(["rev-parse", "--verify", "--quiet", `${before}^{commit}`])
      ? new Set(tagsMergedInto(before))
      : new Set<string>()

  return [...after].filter((version) => !known.has(version)).sort()
}

async function promoteVersion(
  version: string,
  channel: string,
  env: NodeJS.ProcessEnv,
  dryRun: boolean
): Promise<void> {
  const vault = bucket(variable(env, "agentBucket"), env, dryRun)
  const downloads = bucket(variable(env, "downloadsBucket"), env, dryRun)
  const platform = platformFromEnv(
    variable(env, "productionPlatform"),
    env,
    dryRun
  )
  const temp = mkdtempSync(path.join(tmpdir(), "pupitre-promote-"))

  try {
    const agentFile = path.join(temp, "agent.json")
    const appFile = path.join(temp, "app.json")

    await get(vault, keys.agent(version, "publications.json"), agentFile)
    await get(vault, keys.appDeclarations(version), appFile)

    if (!dryRun) {
      for (const publication of readAgentPublications(agentFile)) {
        await declareAgent(platform, publication)
      }

      for (const publication of JSON.parse(
        readFileSync(appFile, "utf8")
      ) as AppPublication[]) {
        await declareApp(platform, publication)
      }
    }

    await promoteAgent(platform, version, channel)
    await promoteApp(platform, version, channel)

    for (const feed of FEEDS) {
      const local = path.join(temp, feed)

      await get(downloads, objectKey(version, feed), local)
      await put(downloads, feedKey(channel, feed), local)
    }
  } finally {
    rmSync(temp, { force: true, recursive: true })
  }

  say(`${version} is ${channel} on ${platform.url}`)
}

export async function promoteCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const dryRun = hasFlag(argv, "dry-run")
  const channel = argumentOf(argv, "channel") ?? "stable"
  const requested = argumentOf(argv, "version")
  const versions = requested
    ? [requested.replace(LEADING_V_RE, "")]
    : versionsSince(argumentOf(argv, "since"))

  if (versions.length === 0) {
    say("nothing new to promote.")

    return
  }

  for (const version of versions) {
    await promoteVersion(version, channel, env, dryRun)
  }
}
