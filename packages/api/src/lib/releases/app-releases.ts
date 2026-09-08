import type { AppRelease, ReleaseChannel } from "@pupitre/db/cloudflare/client"
import type {
  DesktopArchitecture,
  DesktopSystem,
} from "@pupitre/shared/releases"
import { compareVersions, latestBy } from "@pupitre/shared/semver"
import { getPrisma } from "../api/prisma"
import { recordEvent } from "../audit/audit"
import { publishOnce } from "./publish"
import { CHANNEL_SOURCES } from "./releases"

export class AppReleaseFingerprintConflictError extends Error {
  constructor(version: string, os: string, arch: string) {
    super(
      `${version} (${os}/${arch}) is already published with another fingerprint`
    )
    this.name = "AppReleaseFingerprintConflictError"
  }
}

export interface AppBuildView {
  os: DesktopSystem
  arch: DesktopArchitecture
  format: string
  url: string
  bytes: number
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
  arch: DesktopArchitecture
  format: string
  url: string
  bytes: number
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
    arch: release.arch as DesktopArchitecture,
    format: release.format,
    url: release.url,
    bytes: release.bytes,
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

export async function findAppReleaseBuild(
  version: string,
  os: DesktopSystem,
  arch: DesktopArchitecture
): Promise<AppRelease | null> {
  return await getPrisma().appRelease.findUnique({
    where: { version_os_arch: { version, os, arch } },
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
  const newest = latestBy(candidates, (candidate) => candidate.version)

  if (!newest) {
    return null
  }

  return toAppReleaseView(
    candidates.filter((candidate) => candidate.version === newest.version)
  )
}

/**
 * The published versions, most recent first.
 *
 * The site's download page reads this list at build time: it names the
 * artefacts, their size and their checksum, and nothing that requires a session.
 */
export async function listAppReleases(
  channel: ReleaseChannel,
  limit = 10
): Promise<AppReleaseView[]> {
  const rows = await getPrisma().appRelease.findMany({
    where: { channel: { in: CHANNEL_SOURCES[channel] } },
  })

  const versions = [...new Set(rows.map((row) => row.version))]
    .sort((left, right) => compareVersions(right, left))
    .slice(0, limit)

  return versions
    .map((version) =>
      toAppReleaseView(rows.filter((row) => row.version === version))
    )
    .filter((release) => release !== null)
}

export async function promoteAppRelease(
  actorUserId: string,
  version: string,
  channel: ReleaseChannel
): Promise<AppReleaseView | null> {
  const prisma = getPrisma()
  const published = await prisma.appRelease.findMany({ where: { version } })

  if (published.length === 0) {
    return null
  }

  await prisma.appRelease.updateMany({ where: { version }, data: { channel } })

  await recordEvent({
    action: "app_release.promoted",
    actorUserId,
    targetType: "app_release",
    targetId: version,
    payload: { channel, os: published.map((release) => release.os) },
  })

  return toAppReleaseView(published.map((release) => ({ ...release, channel })))
}

export async function publishAppRelease(
  actorUserId: string,
  input: PublishAppReleaseInput
): Promise<PublishAppReleaseResult> {
  const data = {
    version: input.version,
    os: input.os,
    arch: input.arch,
    format: input.format,
    url: input.url,
    bytes: input.bytes,
    sha256: input.sha256,
    signature: input.signature ?? null,
    notes: input.notes,
    channel: input.channel ?? "beta",
  }

  const { row, created } = await publishOnce<AppRelease>({
    find: () => findAppReleaseBuild(input.version, input.os, input.arch),
    create: () => getPrisma().appRelease.create({ data }),
    hasSameFingerprint: (release) => hasSameFingerprint(release, input),
    conflict: () =>
      new AppReleaseFingerprintConflictError(
        input.version,
        input.os,
        input.arch
      ),
  })

  if (created) {
    await recordEvent({
      action: "app_release.published",
      actorUserId,
      targetType: "app_release",
      targetId: row.version,
      payload: {
        os: row.os,
        arch: row.arch,
        channel: row.channel,
        sha256: row.sha256,
      },
    })
  }

  return { build: toAppReleaseBuildView(row), created }
}
