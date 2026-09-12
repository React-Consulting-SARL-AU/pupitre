import { FEEDS, feedKey } from "../../apps/desktop/scripts/release-artefacts"
import { say, variable } from "./cli"

/**
 * What a customer meets once a version is published, checked from outside:
 * the platform describes the version, every installer it names is served
 * whole by the public bucket, and the channel's feeds point at the version.
 * A release is not done because every step returned: it is done when this
 * passes, and it passes again on any day the question comes up.
 */

interface Build {
  os: string
  arch: string
  format: string
  url: string
  bytes: number
}

interface Release {
  version: string
  channel: string
  builds: Build[]
}

const VERSION_LINE_RE = /^version:\s*(\S+)\s*$/m

export function feedNamesVersion(feed: string, version: string): boolean {
  return feed.match(VERSION_LINE_RE)?.[1] === version
}

/** Nothing to say about a file served whole; else what is wrong with it. */
export function verdictOf(
  status: number,
  contentLength: string | null,
  bytes: number
): string | null {
  if (status !== 200) {
    return `answers ${status}`
  }

  if (Number(contentLength) !== bytes) {
    return `is ${contentLength} bytes, not ${bytes}`
  }

  return null
}

async function describedRelease(
  platform: string,
  version: string
): Promise<Release> {
  const response = await fetch(
    new URL(`/api/v1/releases/app/${version}`, platform)
  )

  if (!response.ok) {
    throw new Error(
      `${platform} does not describe ${version}: ${response.status}`
    )
  }

  return ((await response.json()) as { data: Release }).data
}

export async function verifyRelease(env: NodeJS.ProcessEnv): Promise<string[]> {
  const version = variable(env, "version")
  const channel = variable(env, "channel")
  const platform = variable(env, "platform")
  const downloads = variable(env, "downloadsUrl")
  const release = await describedRelease(platform, version)
  const failures: string[] = []

  say(
    `${platform}: ${version} in ${release.channel}, ${release.builds.length} builds`
  )

  for (const build of release.builds) {
    const response = await fetch(build.url, { method: "HEAD" })
    const verdict = verdictOf(
      response.status,
      response.headers.get("content-length"),
      build.bytes
    )

    say(`- ${build.os}/${build.arch} ${build.format}: ${build.url}`)

    if (verdict) {
      failures.push(`${build.url} ${verdict}`)
    }
  }

  for (const feed of FEEDS) {
    const url = `${downloads}/${feedKey(channel, feed)}`
    const response = await fetch(url)
    const named =
      response.ok && feedNamesVersion(await response.text(), version)

    say(`- feed ${channel}/${feed}: ${named ? version : "not this version"}`)

    if (!named) {
      failures.push(`${url} does not name ${version}`)
    }
  }

  return failures
}

export async function verifyCommand(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  const failures = await verifyRelease(env)

  if (failures.length > 0) {
    throw new Error(
      `the release is not downloadable:\n${failures.map((line) => `- ${line}`).join("\n")}`
    )
  }
}
