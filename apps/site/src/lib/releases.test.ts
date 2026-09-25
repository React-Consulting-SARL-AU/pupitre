import { describe, expect, it, vi } from "vitest"
import { FALLBACK_RELEASES } from "../content/site/releases"
import {
  type AppRelease,
  assetsFor,
  ENDPOINT_VARIABLE,
  latestRelease,
  loadReleases,
  megabytes,
  parseRelease,
  parseReleases,
  shortDigest,
  sortReleases,
} from "./releases"

const DIGEST = "a".repeat(64)

const release = (over: Partial<AppRelease> = {}): AppRelease => ({
  version: "1.2.0",
  channel: "stable",
  published_at: "2026-09-02T00:00:00.000Z",
  assets: [
    {
      os: "macos",
      arch: "arm64",
      format: "dmg",
      size_bytes: 120_000_000,
      sha256: DIGEST,
      url: "https://example.test/mac",
    },
  ],
  ...over,
})

/** Mirrors the platform's raw response shape: builds, not assets, and size in bytes. */
const served = (over: Record<string, unknown> = {}) => ({
  version: "1.2.0",
  channel: "stable",
  notes: "Une version.",
  published_at: "2026-09-02T00:00:00.000Z",
  builds: [
    {
      os: "macos",
      arch: "arm64",
      format: "dmg",
      bytes: 120_000_000,
      sha256: DIGEST,
      url: "https://example.test/mac",
    },
  ],
  ...over,
})

function respondWith(payload: unknown, ok = true): typeof fetch {
  return vi.fn(
    async () =>
      new Response(JSON.stringify(payload), { status: ok ? 200 : 503 })
  ) as unknown as typeof fetch
}

describe("parseRelease", () => {
  it("turns the builds the platform published into downloadable assets", () => {
    expect(parseRelease(served())).toEqual(release())
  })

  it("refuses a release with a bad digest, an unknown os or no build", () => {
    expect(parseRelease({ ...served(), builds: [] })).toBeNull()
    expect(
      parseRelease({
        ...served(),
        builds: [{ ...served().builds[0], sha256: "short" }],
      })
    ).toBeNull()
    expect(
      parseRelease({
        ...served(),
        builds: [{ ...served().builds[0], os: "haiku" }],
      })
    ).toBeNull()
    expect(
      parseRelease({
        ...served(),
        builds: [{ ...served().builds[0], bytes: undefined }],
      })
    ).toBeNull()
    expect(parseRelease({ ...served(), channel: "nightly" })).toBeNull()
    expect(parseRelease("not an object")).toBeNull()
  })
})

describe("parseReleases", () => {
  it("reads both a bare array and an envelope", () => {
    expect(parseReleases([served()])).toHaveLength(1)
    expect(parseReleases({ data: [served()] })).toHaveLength(1)
  })

  it("refuses a payload with nothing usable in it", () => {
    expect(parseReleases({})).toBeNull()
    expect(parseReleases([{ version: 3 }])).toBeNull()
  })
})

describe("latestRelease", () => {
  it("prefers the newest stable release", () => {
    const beta = release({
      version: "1.3.0-beta",
      channel: "beta",
      published_at: "2026-09-10T00:00:00.000Z",
    })

    expect(latestRelease([release(), beta])?.version).toBe("1.2.0")
  })

  it("falls back to the newest of any channel when no stable exists", () => {
    const beta = release({ version: "0.1.0", channel: "beta" })

    expect(latestRelease([beta])?.version).toBe("0.1.0")
  })

  it("sorts newest first", () => {
    const older = release({
      version: "1.1.0",
      published_at: "2026-08-01T00:00:00.000Z",
    })

    expect(sortReleases([older, release()])[0].version).toBe("1.2.0")
  })
})

describe("assets", () => {
  it("selects by system and states size and digest for a human", () => {
    expect(assetsFor(release(), "macos")).toHaveLength(1)
    expect(assetsFor(release(), "windows")).toHaveLength(0)
    expect(megabytes(120_000_000)).toBe(120)
    expect(shortDigest(DIGEST)).toBe("aaaaaaaaaaaa")
  })
})

describe("loadReleases", () => {
  it("reads the platform when it answers", async () => {
    const warn = vi.fn()
    const releases = await loadReleases({
      fetcher: respondWith({ data: [served()] }),
      warn,
      endpoint: "https://example.test/releases",
    })

    expect(releases[0].version).toBe("1.2.0")
    expect(warn).not.toHaveBeenCalled()
  })

  it("ships the last known list when no endpoint is configured", async () => {
    const warn = vi.fn()
    const fetcher = vi.fn() as unknown as typeof fetch

    const releases = await loadReleases({ fetcher, warn, endpoint: undefined })

    expect(releases).toEqual(FALLBACK_RELEASES)
    expect(fetcher).not.toHaveBeenCalled()
    expect(warn.mock.calls[0][0]).toContain(ENDPOINT_VARIABLE)
  })

  it("ships the last known list and warns when the platform is unreachable", async () => {
    const warn = vi.fn()
    const fetcher = vi.fn(async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch

    const releases = await loadReleases({
      fetcher,
      warn,
      endpoint: "https://example.test/releases",
    })

    expect(releases).toEqual(FALLBACK_RELEASES)
    expect(warn).toHaveBeenCalledOnce()
    expect(warn.mock.calls[0][0]).toContain("last known list")
  })

  it("ships the last known list on an error status", async () => {
    const warn = vi.fn()
    const releases = await loadReleases({
      fetcher: respondWith({}, false),
      warn,
      endpoint: "https://example.test/releases",
    })

    expect(releases).toEqual(FALLBACK_RELEASES)
    expect(warn.mock.calls[0][0]).toContain("503")
  })

  it("ships the last known list when the shape does not match", async () => {
    const warn = vi.fn()
    const releases = await loadReleases({
      fetcher: respondWith({ data: [{ version: 1 }] }),
      warn,
      endpoint: "https://example.test/releases",
    })

    expect(releases).toEqual(FALLBACK_RELEASES)
    expect(warn.mock.calls[0][0]).toContain("expected shape")
  })
})

describe("loadReleases in a production build", () => {
  it("stops the build rather than publish the fallback's links", async () => {
    const warn = vi.fn()
    const offline = vi.fn(async () => {
      throw new Error("offline")
    }) as unknown as typeof fetch

    await expect(
      loadReleases({
        fetcher: offline,
        warn,
        endpoint: "https://example.test/releases",
        strict: true,
      })
    ).rejects.toThrow("publishes no download link")
    await expect(
      loadReleases({
        fetcher: offline,
        warn,
        endpoint: undefined,
        strict: true,
      })
    ).rejects.toThrow(ENDPOINT_VARIABLE)
    await expect(
      loadReleases({
        fetcher: respondWith({}, false),
        warn,
        endpoint: "https://example.test/releases",
        strict: true,
      })
    ).rejects.toThrow("503")
    expect(warn).not.toHaveBeenCalled()
  })

  it("reads the platform as usual when it answers", async () => {
    const releases = await loadReleases({
      fetcher: respondWith({ data: [served()] }),
      endpoint: "https://example.test/releases",
      strict: true,
    })

    expect(releases[0].version).toBe("1.2.0")
  })
})

describe("the static fallback", () => {
  it("covers the three systems", () => {
    const release = latestRelease(FALLBACK_RELEASES)

    expect(release).toBeDefined()
    for (const os of ["macos", "windows", "linux"] as const) {
      expect(assetsFor(release as AppRelease, os).length).toBeGreaterThan(0)
    }
  })

  it("claims no size and no digest, which the repository cannot know", () => {
    for (const asset of FALLBACK_RELEASES.flatMap((entry) => entry.assets)) {
      expect(asset.sha256, asset.url).toBeUndefined()
      expect(asset.size_bytes, asset.url).toBeUndefined()
    }
  })
})
