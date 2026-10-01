import {
  mountedSocialProviders,
  type SocialProviderId,
} from "@pupitre/auth/server"
import type { ReleaseChannel } from "@pupitre/db/cloudflare/client"
import type { BillingMode } from "@pupitre/shared/plans"
import { latestBy } from "@pupitre/shared/semver"
import { type StatusFreshness, statusFreshness } from "@pupitre/shared/status"
import { getApiAuth } from "../api/plugins/auth"
import { getPrisma } from "../api/prisma"
import { getBillingMode } from "../billing/runtime"

export type ServiceHealth = "ok" | "down"

export interface BillingStatus {
  mode: BillingMode
}

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
  last_observation_at: Date | null
  freshness: StatusFreshness
  checked_at: Date
  social_providers: SocialProviderId[]
  billing: BillingStatus
}

// A misconfigured `BILLING_MODE` degrades this line, never the whole public status.
function billingStatus(): BillingStatus {
  try {
    return { mode: getBillingMode() }
  } catch (error) {
    console.error("[api] status: the billing mode is unreadable", error)

    return { mode: "off" }
  }
}

interface ReleaseRow {
  version: string
  channel: ReleaseChannel
  publishedAt: Date
}

function newest(releases: ReleaseRow[]): PublishedRelease | null {
  const latest = latestBy(releases, (release) => release.version)

  return latest
    ? {
        version: latest.version,
        channel: latest.channel,
        published_at: latest.publishedAt,
      }
    : null
}

/** Public: nothing here may name an organisation, a person or a machine. */
export async function readServiceStatus(
  now: Date = new Date()
): Promise<ServiceStatus> {
  const prisma = getPrisma()
  const socialProviders = mountedSocialProviders(getApiAuth())
  const billing = billingStatus()

  try {
    const [activeServers, releases, lastObservation] = await Promise.all([
      prisma.server.count({ where: { status: "active" } }),
      prisma.release.findMany({
        where: { channel: "stable" },
        select: { version: true, channel: true, publishedAt: true },
      }),
      prisma.server.aggregate({
        where: { status: "active" },
        _max: { lastHeartbeatAt: true },
      }),
    ])

    const lastObservationAt = lastObservation._max.lastHeartbeatAt ?? null

    return {
      api: "ok",
      database: "ok",
      latest_release: newest(releases),
      active_servers: activeServers,
      last_observation_at: lastObservationAt,
      freshness: statusFreshness(lastObservationAt, now),
      checked_at: now,
      social_providers: socialProviders,
      billing,
    }
  } catch (error) {
    console.error("[api] status: the database did not answer", error)

    return {
      api: "ok",
      database: "down",
      latest_release: null,
      active_servers: 0,
      last_observation_at: null,
      freshness: "unknown",
      checked_at: now,
      social_providers: socialProviders,
      billing,
    }
  }
}
