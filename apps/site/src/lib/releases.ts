import { FALLBACK_RELEASES } from "../content/site/releases"

export const OPERATING_SYSTEMS = ["macos", "windows", "linux"] as const

export type OperatingSystem = (typeof OPERATING_SYSTEMS)[number]

export const ARCHITECTURES = ["arm64", "x64", "universal"] as const

export type Architecture = (typeof ARCHITECTURES)[number]

export const RELEASE_CHANNELS = ["stable", "beta"] as const

export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number]

export interface AppAsset {
  os: OperatingSystem
  arch: Architecture
  format: string
  url: string
  /** Absent on the static fallback, which cannot know the published file. */
  size_bytes?: number
  /** Absent on the static fallback: a wrong checksum is worse than none. */
  sha256?: string
}

export interface AppRelease {
  version: string
  channel: ReleaseChannel
  published_at: string
  assets: AppAsset[]
}

export interface ReleaseList {
  releases: AppRelease[]
  /** True when the platform could not be read and the static list was used. */
  stale: boolean
}

const SHA256_RE = /^[0-9a-f]{64}$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** The platform's build becomes an asset here; one missing its size or digest is dropped — silence beats a wrong claim. */
function parseAsset(value: unknown): AppAsset | null {
  if (!isRecord(value)) {
    return null
  }

  const { os, arch, format, bytes, sha256, url } = value
  const known =
    OPERATING_SYSTEMS.includes(os as OperatingSystem) &&
    ARCHITECTURES.includes(arch as Architecture) &&
    typeof format === "string" &&
    typeof bytes === "number" &&
    Number.isFinite(bytes) &&
    typeof sha256 === "string" &&
    SHA256_RE.test(sha256) &&
    typeof url === "string"

  if (!known) {
    return null
  }

  return {
    os: os as OperatingSystem,
    arch: arch as Architecture,
    format,
    url,
    size_bytes: bytes,
    sha256,
  }
}

export function parseRelease(value: unknown): AppRelease | null {
  if (!isRecord(value)) {
    return null
  }

  const { version, channel, published_at, builds } = value
  const shaped =
    typeof version === "string" &&
    version.length > 0 &&
    RELEASE_CHANNELS.includes(channel as ReleaseChannel) &&
    typeof published_at === "string" &&
    Array.isArray(builds)

  if (!shaped) {
    return null
  }

  const parsed = (builds as unknown[]).map(parseAsset)

  if (parsed.length === 0 || parsed.some((asset) => asset === null)) {
    return null
  }

  return {
    version,
    channel: channel as ReleaseChannel,
    published_at,
    assets: parsed as AppAsset[],
  }
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
}

export const ENDPOINT_VARIABLE = "PUBLIC_RELEASES_URL"

/**
 * Read at build time. A platform that cannot be reached is not a build error:
 * the page ships with the last list the repository knows, plus a warning.
 */
export async function loadReleases({
  fetcher = fetch,
  warn = (message) => process.emitWarning(message),
  endpoint = import.meta.env.PUBLIC_RELEASES_URL,
}: FetchOptions = {}): Promise<ReleaseList> {
  const fallback = { releases: FALLBACK_RELEASES, stale: true }

  if (!endpoint) {
    warn(
      `${ENDPOINT_VARIABLE} is not set; the download page ships the last known list.`
    )

    return fallback
  }

  try {
    const response = await fetcher(endpoint, {
      headers: { accept: "application/json" },
    })

    if (!response.ok) {
      warn(
        `Release list unavailable (${response.status} from ${endpoint}); the download page ships the last known list.`
      )

      return fallback
    }

    const releases = parseReleases(await response.json())

    if (!releases) {
      warn(
        `Release list from ${endpoint} did not match the expected shape; the download page ships the last known list.`
      )

      return fallback
    }

    return { releases: sortReleases(releases), stale: false }
  } catch (error) {
    warn(
      `Release list could not be read from ${endpoint} (${String(error)}); the download page ships the last known list.`
    )

    return fallback
  }
}
