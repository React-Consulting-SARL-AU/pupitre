import { describe, expect, it } from "bun:test"
import {
  APP_R2_KEY_PATTERN,
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
    arch: "arm64",
    format: "dmg",
    r2_key: "app/1.4.0/Pupitre-1.4.0-arm64.dmg",
    bytes: 118_000_000,
    sha256: SHA256,
    signature: `${"c".repeat(86)}==`,
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
  it("accepts a publication and leaves the channel to the platform", () => {
    const parsed = AppReleasePublishSchema.safeParse(publication())

    expect(parsed.success).toBe(true)
    expect(parsed.data?.channel).toBeUndefined()
  })

  it("refuses a publication without a signature", () => {
    expect(
      AppReleasePublishSchema.safeParse(publication({ signature: undefined }))
        .success
    ).toBe(false)
  })

  // A key is a place in our bucket, never an address: the platform composes the
  // URL, so nothing published can name a host.
  it("refuses a key that would leave the versions folder", () => {
    for (const r2_key of [
      "//evil.example/Pupitre.dmg",
      "/app/1.4.0/Pupitre.dmg",
      "app/1.4.0/../../../etc/passwd",
      "../app/1.4.0/Pupitre.dmg",
      "https://evil.example/Pupitre.dmg",
      "agent/1.4.0/pupitred-linux-amd64",
      "app//Pupitre.dmg",
      "app/1.4.0/",
    ]) {
      expect(
        AppReleasePublishSchema.safeParse(publication({ r2_key })).success
      ).toBe(false)
    }
  })

  it("accepts the keys the release actually writes", () => {
    for (const r2_key of [
      "app/1.4.0/Pupitre-1.4.0-arm64.dmg",
      "app/1.5.0-beta.1/Pupitre-Setup-1.5.0-beta.1-x64.exe",
      "app/1.4.0/pupitre_1.4.0_amd64.deb",
      "app/1.4.0/latest-mac.yml",
      "app/1.4.0/Pupitre-1.4.0-arm64.dmg.blockmap",
    ]) {
      expect(
        AppReleasePublishSchema.safeParse(publication({ r2_key })).success
      ).toBe(true)
    }
  })

  it("names the pattern the platform enforces", () => {
    expect(new RegExp(APP_R2_KEY_PATTERN).test("app/1.4.0/Pupitre.dmg")).toBe(
      true
    )
  })

  it("refuses a build that names neither its architecture nor its format", () => {
    expect(
      AppReleasePublishSchema.safeParse(publication({ arch: undefined }))
        .success
    ).toBe(false)
    expect(
      AppReleasePublishSchema.safeParse(publication({ format: "" })).success
    ).toBe(false)
    expect(
      AppReleasePublishSchema.safeParse(publication({ bytes: 0 })).success
    ).toBe(false)
  })

  it("refuses a broken digest", () => {
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
          format: "dmg",
          url: "https://dl.pupitre.studio/app/1.4.0/Pupitre-1.4.0-arm64.dmg",
          bytes: 118_000_000,
          sha256: SHA256,
          signature: null,
        },
      ],
    })

    expect(parsed.success).toBe(true)
    expect(parsed.data?.builds).toHaveLength(1)
  })
})
