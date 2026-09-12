import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  FEEDS,
  feedKey,
  objectKey,
} from "../../apps/desktop/scripts/release-artefacts"
import { argumentOf, hasFlag, say, variable } from "./cli"
import { platformFromEnv, promoteAgent, promoteApp } from "./platform"
import { bucket, get, put } from "./r2"

/**
 * A published version changes channel here, and only here: the platform is
 * told for the agent and for the app, then the channel's feeds are pointed
 * at the version's files. Nothing is rebuilt, nothing is re-signed. A release
 * goes out `stable` on its own, so this is the way back: the previous version
 * promoted again is what every app and every agent sees next.
 *
 * Every request is idempotent, so a promotion run twice changes nothing the
 * second time.
 */

const LEADING_V_RE = /^v/

export async function promoteCommand(
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const dryRun = hasFlag(argv, "dry-run")
  const channel = argumentOf(argv, "channel") ?? "stable"
  const requested = argumentOf(argv, "version")

  if (!requested) {
    throw new Error("--version=X.Y.Z names the version to promote.")
  }

  const version = requested.replace(LEADING_V_RE, "")
  const downloads = bucket(variable(env, "downloadsBucket"), env, dryRun)
  const platform = platformFromEnv(variable(env, "platform"), env, dryRun)
  const temp = mkdtempSync(path.join(tmpdir(), "pupitre-promote-"))

  try {
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
