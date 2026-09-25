import {
  type AppBuild,
  AppReleaseSchema,
  DESKTOP_SYSTEMS,
  type DesktopArchitecture,
  type DesktopSystem,
  SHA256_PATTERN,
  type ReleaseChannel as SharedReleaseChannel,
} from "@pupitre/shared/releases"
import { isProduction } from "../../scripts/legal"
import { FALLBACK_RELEASES } from "../content/site/releases"

export const OPERATING_SYSTEMS = DESKTOP_SYSTEMS

export type OperatingSystem = DesktopSystem

export type Architecture = DesktopArchitecture

export type ReleaseChannel = SharedReleaseChannel

export interface AppAsset {
  os: OperatingSystem
  arch: Architecture
  format: string
  url: string
  size_bytes?: number
  // Absent on the static fallback: a wrong checksum is worse than none.
  sha256?: string
}

export interface AppRelease {
  version: string
  channel: ReleaseChannel
  published_at: string
  assets: AppAsset[]
}

const SHA256_RE = new RegExp(SHA256_PATTERN)

function assetOf({ os, arch, format, url, bytes, sha256 }: AppBuild): AppAsset {
  return { os, arch, format, url, size_bytes: bytes, sha256 }
}

// One build without a showable digest drops the whole release: silence beats a wrong claim.
export function parseRelease(value: unknown): AppRelease | null {
  const parsed = AppReleaseSchema.safeParse(value)

  if (!parsed.success) {
    return null
  }

  const { version, channel, published_at, builds } = parsed.data
  const complete =
    version.length > 0 &&
    builds.length > 0 &&
    builds.every((build) => SHA256_RE.test(build.sha256))

  return complete
    ? { version, channel, published_at, assets: builds.map(assetOf) }
    : null
}

export function parseReleases(payload: unknown): AppRelease[] | null {
  const list = Array.isArray(payload)
    ? payload
    : (payload as { data?: unknown })?.data

  if (!Array.isArray(list)) {
    return null
  }

  const parsed = list.map(parseRelease).filter((release) => release !== null)

  return parsed.length > 0 ? parsed : null
}

export function sortReleases(releases: AppRelease[]): AppRelease[] {
  return [...releases].sort(
    (a, b) => Date.parse(b.published_at) - Date.parse(a.published_at)
  )
}

export function latestRelease(releases: AppRelease[]): AppRelease | undefined {
  const stable = sortReleases(releases).filter(
    (release) => release.channel === "stable"
  )

  return stable[0] ?? sortReleases(releases)[0]
}

export function assetsFor(
  release: AppRelease,
  os: OperatingSystem
): AppAsset[] {
  return release.assets.filter((asset) => asset.os === os)
}

const BYTES_IN_MB = 1_000_000

export function megabytes(bytes: number): number {
  return Math.round(bytes / BYTES_IN_MB)
}

export function shortDigest(sha256: string): string {
  return sha256.slice(0, 12)
}

export interface FetchOptions {
  fetcher?: typeof fetch
  warn?: (message: string) => void
  endpoint?: string
  strict?: boolean
}

export const ENDPOINT_VARIABLE = "PUBLIC_RELEASES_URL"

const FALLBACK_NOTE = "the download page ships the last known list"

async function readReleases(
  fetcher: typeof fetch,
  endpoint: string
): Promise<AppRelease[] | string> {
  try {
    const response = await fetcher(endpoint, {
      headers: { accept: "application/json" },
    })

    if (!response.ok) {
      return `Release list unavailable (${response.status} from ${endpoint})`
    }

    const releases = parseReleases(await response.json())

    return releases
      ? sortReleases(releases)
      : `Release list from ${endpoint} did not match the expected shape`
  } catch (error) {
    return `Release list could not be read from ${endpoint} (${String(error)})`
  }
}

export async function loadReleases({
  fetcher = fetch,
  warn = (message) => process.emitWarning(message),
  endpoint = import.meta.env.PUBLIC_RELEASES_URL,
  strict = isProduction(),
}: FetchOptions = {}): Promise<AppRelease[]> {
  const read = endpoint
    ? await readReleases(fetcher, endpoint)
    : `${ENDPOINT_VARIABLE} is not set`

  if (typeof read !== "string") {
    return read
  }

  if (strict) {
    throw new Error(
      `${read}: a production build publishes no download link it has not read from the platform.`
    )
  }

  warn(`${read}; ${FALLBACK_NOTE}.`)

  return FALLBACK_RELEASES
}
