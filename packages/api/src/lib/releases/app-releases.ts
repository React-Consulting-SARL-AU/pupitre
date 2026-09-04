import type { AppRelease, ReleaseChannel } from "@pupitre/db/cloudflare/client"
import type { DesktopSystem } from "@pupitre/shared/releases"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { CHANNEL_SOURCES } from "./releases"
import { compareVersions } from "./semver"

const UNIQUE_VIOLATION = "P2002"

export class AppReleaseFingerprintConflictError extends Error {
  constructor(version: string, os: string) {
    super(`${version} (${os}) is already published with another fingerprint`)
    this.name = "AppReleaseFingerprintConflictError"
  }
}

export interface AppBuildView {
  os: DesktopSystem
  arch: string | null
  url: string
  sha256: string
  signature: string | null
}

export interface AppReleaseView {
  version: string
  channel: ReleaseChannel
  notes: string
  published_at: Date
  builds: AppBuildView[]
}

export interface PublishAppReleaseInput {
  version: string
  os: DesktopSystem
  arch?: string
  url: string
  sha256: string
  signature?: string
  notes: string
  channel?: ReleaseChannel
}

export interface PublishAppReleaseResult {
  build: AppReleaseBuildView
  created: boolean
}

export interface AppReleaseBuildView extends AppBuildView {
  version: string
  notes: string
  channel: ReleaseChannel
  published_at: Date
}

function toBuildView(release: AppRelease): AppBuildView {
  return {
    os: release.os,
    arch: release.arch,
    url: release.url,
    sha256: release.sha256,
    signature: release.signature,
  }
}

export function toAppReleaseBuildView(
  release: AppRelease
): AppReleaseBuildView {
  return {
    ...toBuildView(release),
    version: release.version,
    notes: release.notes,
    channel: release.channel,
    published_at: release.publishedAt,
  }
}

function byPublication(left: AppRelease, right: AppRelease): number {
  return left.publishedAt.getTime() - right.publishedAt.getTime()
}

export function toAppReleaseView(rows: AppRelease[]): AppReleaseView | null {
  const [first, ...rest] = [...rows].sort(byPublication)

  if (!first) {
    return null
  }

  return {
    version: first.version,
    channel: first.channel,
    notes: first.notes,
    published_at: first.publishedAt,
    builds: [first, ...rest].map(toBuildView),
  }
}

function hasSameFingerprint(
  release: AppRelease,
  input: PublishAppReleaseInput
): boolean {
  return (
    release.sha256 === input.sha256 &&
    release.url === input.url &&
    release.signature === (input.signature ?? null)
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

export async function findAppReleaseBuild(
  version: string,
  os: DesktopSystem
): Promise<AppRelease | null> {
  return await getPrisma().appRelease.findUnique({
    where: { version_os: { version, os } },
  })
}

export async function findAppRelease(
  version: string
): Promise<AppReleaseView | null> {
  return toAppReleaseView(
    await getPrisma().appRelease.findMany({ where: { version } })
  )
}

export async function latestAppRelease(
  channel: ReleaseChannel
): Promise<AppReleaseView | null> {
  const candidates = await getPrisma().appRelease.findMany({
    where: { channel: { in: CHANNEL_SOURCES[channel] } },
  })
  const newest = candidates.reduce<string | null>(
    (best, candidate) =>
      best && compareVersions(candidate.version, best) <= 0
        ? best
        : candidate.version,
    null
  )

  if (!newest) {
    return null
  }

  return toAppReleaseView(
    candidates.filter((candidate) => candidate.version === newest)
  )
}

export async function publishAppRelease(
  actorUserId: string,
  input: PublishAppReleaseInput
): Promise<PublishAppReleaseResult> {
  const existing = await findAppReleaseBuild(input.version, input.os)

  if (existing) {
    if (!hasSameFingerprint(existing, input)) {
      throw new AppReleaseFingerprintConflictError(input.version, input.os)
    }

    return { build: toAppReleaseBuildView(existing), created: false }
  }

  const data = {
    version: input.version,
    os: input.os,
    arch: input.arch ?? null,
    url: input.url,
    sha256: input.sha256,
    signature: input.signature ?? null,
    notes: input.notes,
    channel: input.channel ?? "beta",
  }

  let created: AppRelease

  try {
    created = await getPrisma().appRelease.create({ data })
  } catch (error) {
    const concurrent = isUniqueViolation(error)
      ? await findAppReleaseBuild(input.version, input.os)
      : null

    if (!concurrent) {
      throw error
    }

    if (!hasSameFingerprint(concurrent, input)) {
      throw new AppReleaseFingerprintConflictError(input.version, input.os)
    }

    return { build: toAppReleaseBuildView(concurrent), created: false }
  }

  await recordEvent({
    action: "app_release.published",
    actorUserId,
    targetType: "app_release",
    targetId: created.version,
    payload: {
      os: created.os,
      channel: created.channel,
      sha256: created.sha256,
    },
  })

  return { build: toAppReleaseBuildView(created), created: true }
}
