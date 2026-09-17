import type { Release, ReleaseChannel } from "@pupitre/db/cloudflare/client"
import { isNewer, latestBy } from "@pupitre/shared/semver"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import type { ServerRow } from "../servers/server-row"
import { publishOnce } from "./publish"
import { getReleaseStorage, type ReleaseStorageKind } from "./storage"

export const RELEASE_URL_TTL_SECONDS = 300

export const DEFAULT_ARCH = "amd64"

// No binary published yet: the app keeps pushing the agent it already carries.
export const DEV_RELEASE: EnrollmentRelease = {
  version: "0.0.0-dev",
  url: "",
  sha256: "",
  signature: "",
  channel: "beta",
}

export const CHANNEL_SOURCES: Record<ReleaseChannel, ReleaseChannel[]> = {
  stable: ["stable"],
  beta: ["beta", "stable"],
}

export class ReleaseFingerprintConflictError extends Error {
  constructor(version: string, arch: string) {
    super(`${version} (${arch}) is already published with another fingerprint`)
    this.name = "ReleaseFingerprintConflictError"
  }
}

export interface ReleaseView {
  version: string
  arch: string
  sha256: string
  signature: string
  r2_key: string
  channel: ReleaseChannel
  published_at: Date
}

export interface EnrollmentRelease {
  version: string
  url: string
  sha256: string
  signature: string
  channel: ReleaseChannel
}

export interface PublishReleaseInput {
  version: string
  arch: string
  sha256: string
  signature: string
  r2_key: string
  channel?: ReleaseChannel
}

export interface PublishReleaseResult {
  release: ReleaseView
  created: boolean
}

export function toReleaseView(release: Release): ReleaseView {
  return {
    version: release.version,
    arch: release.arch,
    sha256: release.sha256,
    signature: release.signature,
    r2_key: release.r2Key,
    channel: release.channel,
    published_at: release.publishedAt,
  }
}

function hasSameFingerprint(
  release: Release,
  input: PublishReleaseInput
): boolean {
  return (
    release.sha256 === input.sha256 &&
    release.signature === input.signature &&
    release.r2Key === input.r2_key
  )
}

export async function findRelease(
  version: string,
  arch: string
): Promise<Release | null> {
  return await getPrisma().release.findUnique({
    where: { version_arch: { version, arch } },
  })
}

export async function latestRelease(
  channel: ReleaseChannel,
  arch: string
): Promise<Release | null> {
  const candidates = await getPrisma().release.findMany({
    where: { arch, channel: { in: CHANNEL_SOURCES[channel] } },
  })

  return latestBy(candidates, (candidate) => candidate.version)
}

export async function releaseDownloadUrl(
  release: Release
): Promise<{ url: string; storage: ReleaseStorageKind }> {
  const storage = getReleaseStorage()

  return {
    url: await storage.signedUrl(release.r2Key, RELEASE_URL_TTL_SECONDS),
    storage: storage.kind,
  }
}

export async function publishRelease(
  actor: Actor,
  input: PublishReleaseInput
): Promise<PublishReleaseResult> {
  const { row, created } = await publishOnce<Release>({
    find: () => findRelease(input.version, input.arch),
    create: () =>
      getPrisma().release.create({
        data: {
          version: input.version,
          arch: input.arch,
          sha256: input.sha256,
          signature: input.signature,
          r2Key: input.r2_key,
          channel: input.channel ?? "beta",
        },
      }),
    hasSameFingerprint: (release) => hasSameFingerprint(release, input),
    conflict: () =>
      new ReleaseFingerprintConflictError(input.version, input.arch),
  })

  if (created) {
    await recordEvent({
      action: "release.published",
      actorUserId: actor.userId,
      targetType: "release",
      targetId: row.version,
      payload: {
        by: actor.source,
        arch: row.arch,
        channel: row.channel,
        sha256: row.sha256,
      },
    })
  }

  return { release: toReleaseView(row), created }
}

/**
 * A promotion to stable is also the way back: the stable releases newer than
 * the promoted one, on the architectures it covers, step down to beta so the
 * channel's latest is the version just promoted.
 */
async function demoteNewerStable(
  version: string,
  arches: string[]
): Promise<string[]> {
  const prisma = getPrisma()
  const stable = await prisma.release.findMany({
    where: { channel: "stable", arch: { in: arches } },
    select: { version: true, arch: true },
  })
  const newer = stable.filter((release) => isNewer(release.version, version))

  for (const release of newer) {
    await prisma.release.update({
      where: { version_arch: { version: release.version, arch: release.arch } },
      data: { channel: "beta" },
    })
  }

  return [...new Set(newer.map((release) => release.version))].sort()
}

export async function promoteRelease(
  actor: Actor,
  version: string,
  channel: ReleaseChannel
): Promise<ReleaseView[] | null> {
  const prisma = getPrisma()
  const published = await prisma.release.findMany({ where: { version } })

  if (published.length === 0) {
    return null
  }

  await prisma.release.updateMany({ where: { version }, data: { channel } })

  const demoted =
    channel === "stable"
      ? await demoteNewerStable(
          version,
          published.map((release) => release.arch)
        )
      : []

  await recordEvent({
    action: "release.promoted",
    actorUserId: actor.userId,
    targetType: "release",
    targetId: version,
    payload: {
      by: actor.source,
      channel,
      arch: published.map((release) => release.arch),
      demoted,
    },
  })

  return published.map((release) => toReleaseView({ ...release, channel }))
}

function newest(left: string | null, right: string | null): string | null {
  if (left === null || right === null) {
    return left ?? right
  }

  return isNewer(right, left) ? right : left
}

/** A version the channel once carried and no longer does: promoted away, so a rollback can reach the server. */
async function withdrawnFrom(
  version: string,
  arch: string,
  channel: ReleaseChannel
): Promise<boolean> {
  const release = await findRelease(version, arch)

  return release !== null && !CHANNEL_SOURCES[channel].includes(release.channel)
}

/**
 * The version the platform wants on the server: the channel's latest, never
 * older than what the server already targets or runs — unless that version
 * was withdrawn from the channel, in which case the target moves down to the
 * channel's latest.
 */
export async function resolveTargetVersion(
  server: ServerRow
): Promise<string | null> {
  const latest = await latestRelease(server.channel, server.arch)

  if (!latest) {
    return server.targetVersion
  }

  const carried = newest(server.targetVersion, server.agentVersion)

  if (carried === null || isNewer(latest.version, carried)) {
    return latest.version
  }

  if (await withdrawnFrom(carried, server.arch, server.channel)) {
    return latest.version
  }

  return carried
}

export async function releaseForEnrollment(
  arch: string
): Promise<EnrollmentRelease> {
  const stable = await latestRelease("stable", arch)
  const release = stable ?? (await latestRelease("beta", arch))

  if (!release) {
    return DEV_RELEASE
  }

  const { url } = await releaseDownloadUrl(release)

  return {
    version: release.version,
    url,
    sha256: release.sha256,
    signature: release.signature,
    channel: release.channel,
  }
}
