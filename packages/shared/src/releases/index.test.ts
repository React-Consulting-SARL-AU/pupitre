import { describe, expect, it } from "bun:test"
import {
  AppReleasePublishSchema,
  AppReleaseSchema,
  DESKTOP_SYSTEMS,
  DesktopSystemSchema,
  RELEASE_CHANNELS,
  VersionSchema,
} from "./index"

const SHA256 = "a".repeat(64)

function publication(overrides: Record<string, unknown> = {}) {
  return {
    version: "1.4.0",
    os: "macos",
    url: "https://downloads.pupitre.studio/1.4.0/Pupitre-1.4.0.dmg",
    sha256: SHA256,
    notes: "Première version signée.",
    ...overrides,
  }
}

describe("desktop systems", () => {
  it("names the three systems the app ships on", () => {
    expect(DESKTOP_SYSTEMS).toEqual(["macos", "windows", "linux"])
    expect(DesktopSystemSchema.safeParse("freebsd").success).toBe(false)
  })

  it("shares the channels of the agent releases", () => {
    expect(RELEASE_CHANNELS).toEqual(["stable", "beta"])
  })
})

describe("VersionSchema", () => {
  it("accepts semver and refuses anything else", () => {
    expect(VersionSchema.safeParse("1.4.0").success).toBe(true)
    expect(VersionSchema.safeParse("1.4.0-beta.2").success).toBe(true)
    expect(VersionSchema.safeParse("v1.4").success).toBe(false)
  })
})

describe("AppReleasePublishSchema", () => {
  it("accepts a publication without arch nor signature", () => {
    const parsed = AppReleasePublishSchema.safeParse(publication())

    expect(parsed.success).toBe(true)
    expect(parsed.data?.channel).toBeUndefined()
  })

  it("refuses an url that is not one, and a broken digest", () => {
    expect(
      AppReleasePublishSchema.safeParse(publication({ url: "Pupitre.dmg" }))
        .success
    ).toBe(false)
    expect(
      AppReleasePublishSchema.safeParse(publication({ sha256: "deadbeef" }))
        .success
    ).toBe(false)
  })

  it("refuses empty release notes", () => {
    expect(
      AppReleasePublishSchema.safeParse(publication({ notes: "" })).success
    ).toBe(false)
  })
})

describe("AppReleaseSchema", () => {
  it("carries the version, its notes and one build per system", () => {
    const parsed = AppReleaseSchema.safeParse({
      version: "1.4.0",
      channel: "stable",
      notes: "Première version signée.",
      published_at: new Date().toISOString(),
      builds: [
        {
          os: "macos",
          arch: "arm64",
          url: "https://downloads.pupitre.studio/1.4.0/Pupitre-1.4.0.dmg",
          sha256: SHA256,
          signature: null,
        },
      ],
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.builds).toHaveLength(1)
  })
})
