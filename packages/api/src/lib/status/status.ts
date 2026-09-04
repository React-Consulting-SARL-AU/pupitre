import type { ReleaseChannel } from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import { compareVersions } from "../releases/semver"

export type ServiceHealth = "ok" | "down"

export interface PublishedRelease {
  version: string
  channel: ReleaseChannel
  published_at: Date
}

export interface ServiceStatus {
  api: ServiceHealth
  database: ServiceHealth
  latest_release: PublishedRelease | null
  active_servers: number
  checked_at: Date
}

interface ReleaseRow {
  version: string
  channel: ReleaseChannel
  publishedAt: Date
}

function newest(releases: ReleaseRow[]): PublishedRelease | null {
  const latest = releases.reduce<ReleaseRow | null>(
    (best, release) =>
      best && compareVersions(release.version, best.version) <= 0
        ? best
        : release,
    null
  )

  return latest
    ? {
        version: latest.version,
        channel: latest.channel,
        published_at: latest.publishedAt,
      }
    : null
}

/**
 * The public face of the platform: whether the service answers, never who uses
 * it. Nothing here may name an organisation, a person or a machine.
 */
export async function readServiceStatus(
  now: Date = new Date()
): Promise<ServiceStatus> {
  const prisma = getPrisma()

  try {
    const [activeServers, releases] = await Promise.all([
      prisma.server.count({ where: { status: "active" } }),
      prisma.release.findMany({
        where: { channel: "stable" },
        select: { version: true, channel: true, publishedAt: true },
      }),
    ])

    return {
      api: "ok",
      database: "ok",
      latest_release: newest(releases),
      active_servers: activeServers,
      checked_at: now,
    }
  } catch (error) {
    console.error("[api] status: the database did not answer", error)

    return {
      api: "ok",
      database: "down",
      latest_release: null,
      active_servers: 0,
      checked_at: now,
    }
  }
}
