import type {
  Release,
  ReleaseChannel,
  Server,
} from "@pupitre/db/cloudflare/client"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { compareVersions, isNewer } from "./semver"
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

const UNIQUE_VIOLATION = "P2002"

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

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code: unknown }).code === UNIQUE_VIOLATION
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

  return candidates.reduce<Release | null>(
    (best, candidate) =>
      best && compareVersions(candidate.version, best.version) <= 0
        ? best
        : candidate,
    null
  )
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
  actorUserId: string,
  input: PublishReleaseInput
): Promise<PublishReleaseResult> {
  const existing = await findRelease(input.version, input.arch)

  if (existing) {
    if (!hasSameFingerprint(existing, input)) {
      throw new ReleaseFingerprintConflictError(input.version, input.arch)
    }

    return { release: toReleaseView(existing), created: false }
  }

  let created: Release

  try {
    created = await getPrisma().release.create({
      data: {
        version: input.version,
        arch: input.arch,
        sha256: input.sha256,
        signature: input.signature,
        r2Key: input.r2_key,
        channel: input.channel ?? "beta",
      },
    })
  } catch (error) {
    const concurrent = isUniqueViolation(error)
      ? await findRelease(input.version, input.arch)
      : null

    if (!concurrent) {
      throw error
    }

    if (!hasSameFingerprint(concurrent, input)) {
      throw new ReleaseFingerprintConflictError(input.version, input.arch)
    }

    return { release: toReleaseView(concurrent), created: false }
  }

  await recordEvent({
    action: "release.published",
    actorUserId,
    targetType: "release",
    targetId: created.version,
    payload: {
      arch: created.arch,
      channel: created.channel,
      sha256: created.sha256,
    },
  })

  return { release: toReleaseView(created), created: true }
}

export async function promoteRelease(
  actorUserId: string,
  version: string,
  channel: ReleaseChannel
): Promise<ReleaseView[] | null> {
  const prisma = getPrisma()
  const published = await prisma.release.findMany({ where: { version } })

  if (published.length === 0) {
    return null
  }

  await prisma.release.updateMany({ where: { version }, data: { channel } })

  await recordEvent({
    action: "release.promoted",
    actorUserId,
    targetType: "release",
    targetId: version,
    payload: { channel, arch: published.map((release) => release.arch) },
  })

  return published.map((release) => toReleaseView({ ...release, channel }))
}

export async function resolveTargetVersion(
  server: Server
): Promise<string | null> {
  const latest = await latestRelease(server.channel, server.arch)

  if (!(latest && isNewer(latest.version, server.targetVersion))) {
    return server.targetVersion
  }

  return latest.version
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
