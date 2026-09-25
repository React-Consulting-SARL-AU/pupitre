import type { AppRelease, ReleaseChannel } from "@pupitre/db/cloudflare/client"
import type {
  DesktopArchitecture,
  DesktopSystem,
} from "@pupitre/shared/releases"
import { compareVersions, isNewer, latestBy } from "@pupitre/shared/semver"
import { getPrisma } from "../api/prisma"
import { type Actor, recordEvent } from "../audit/audit"
import { publishOnce } from "./publish"
import { CHANNEL_SOURCES } from "./releases"

const DOWNLOADS_URL_VARIABLE = "PUPITRE_DOWNLOADS_URL"

const TRAILING_SLASHES_RE = /\/+$/

/** Never the publisher's URL, and concatenated since `new URL` would follow a `//` key to another host. */
export function artefactUrl(
  r2Key: string,
  env: Record<string, string | undefined> = process.env
): string {
  const origin = env[DOWNLOADS_URL_VARIABLE]
    ?.trim()
    .replace(TRAILING_SLASHES_RE, "")

  return `${origin || "http://localhost/__downloads"}/${r2Key}`
}

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
  r2_key: string
  bytes: number
  sha256: string
  signature: string
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
    url: artefactUrl(release.r2Key),
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
    release.r2Key === input.r2_key &&
    release.signature === input.signature
  )
}

/** Linux ships two files for one machine: the AppImage, which updates itself, is the one a bare link gets. */
const PREFERRED_FORMATS: readonly string[] = ["AppImage"]

function byPreference(left: AppRelease, right: AppRelease): number {
  const rank = (release: AppRelease) => {
    const index = PREFERRED_FORMATS.indexOf(release.format)

    return index === -1 ? PREFERRED_FORMATS.length : index
  }

  return rank(left) - rank(right) || left.format.localeCompare(right.format)
}

export async function findAppReleaseBuild(
  version: string,
  os: DesktopSystem,
  arch: DesktopArchitecture,
  format?: string
): Promise<AppRelease | null> {
  const builds = await getPrisma().appRelease.findMany({
    where: { version, os, arch, ...(format ? { format } : {}) },
  })

  return builds.sort(byPreference)[0] ?? null
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

// Newer stable versions step down, so the download page rolls back with the agent.
async function demoteNewerStable(version: string): Promise<string[]> {
  const prisma = getPrisma()
  const stable = await prisma.appRelease.findMany({
    where: { channel: "stable" },
    select: { version: true },
    distinct: ["version"],
  })
  const newer = stable
    .map((release) => release.version)
    .filter((candidate) => isNewer(candidate, version))
    .sort()

  if (newer.length > 0) {
    await prisma.appRelease.updateMany({
      where: { version: { in: newer } },
      data: { channel: "beta" },
    })
  }

  return newer
}

export async function promoteAppRelease(
  actor: Actor,
  version: string,
  channel: ReleaseChannel
): Promise<AppReleaseView | null> {
  const prisma = getPrisma()
  const published = await prisma.appRelease.findMany({ where: { version } })

  if (published.length === 0) {
    return null
  }

  await prisma.appRelease.updateMany({ where: { version }, data: { channel } })

  const demoted = channel === "stable" ? await demoteNewerStable(version) : []

  await recordEvent({
    action: "app_release.promoted",
    actorUserId: actor.userId,
    targetType: "app_release",
    targetId: version,
    payload: {
      by: actor.source,
      channel,
      os: published.map((release) => release.os),
      demoted,
    },
  })

  return toAppReleaseView(published.map((release) => ({ ...release, channel })))
}

export async function publishAppRelease(
  actor: Actor,
  input: PublishAppReleaseInput
): Promise<PublishAppReleaseResult> {
  const data = {
    version: input.version,
    os: input.os,
    arch: input.arch,
    format: input.format,
    r2Key: input.r2_key,
    bytes: input.bytes,
    sha256: input.sha256,
    signature: input.signature,
    notes: input.notes,
    channel: input.channel ?? "beta",
  }

  const { row, created } = await publishOnce<AppRelease>({
    find: () =>
      findAppReleaseBuild(input.version, input.os, input.arch, input.format),
    create: () => getPrisma().appRelease.create({ data }),
    hasSameFingerprint: (release) => hasSameFingerprint(release, input),
    conflict: () =>
      new AppReleaseFingerprintConflictError(
        input.version,
        input.os,
        `${input.arch} ${input.format}`
      ),
  })

  if (created) {
    await recordEvent({
      action: "app_release.published",
      actorUserId: actor.userId,
      targetType: "app_release",
      targetId: row.version,
      payload: {
        by: actor.source,
        os: row.os,
        arch: row.arch,
        channel: row.channel,
        sha256: row.sha256,
      },
    })
  }

  return { build: toAppReleaseBuildView(row), created }
}
