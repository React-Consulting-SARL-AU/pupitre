import { describe, expect, it } from "bun:test"
import {
  compareVersions,
  coreVersion,
  isNewer,
  isSemver,
  latestBy,
} from "./index"

describe("isSemver", () => {
  it("accepts a published version and a pre-release", () => {
    expect(isSemver("1.2.3")).toBe(true)
    expect(isSemver("0.2.0-beta.1")).toBe(true)
  })

  it("refuses what is not a version", () => {
    expect(isSemver("v1.2.3")).toBe(false)
    expect(isSemver("1.2")).toBe(false)
  })
})

describe("compareVersions", () => {
  it("orders version numbers", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBeLessThan(0)
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0)
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0)
  })

  it("places a pre-release before its version", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0)
  })
})

describe("isNewer", () => {
  it("treats any version as newer than nothing", () => {
    expect(isNewer("0.1.0", null)).toBe(true)
  })

  it("refuses an equal or older version", () => {
    expect(isNewer("1.0.0", "1.0.0")).toBe(false)
    expect(isNewer("0.9.0", "1.0.0")).toBe(false)
  })
})

describe("coreVersion", () => {
  it("strips the pre-release", () => {
    expect(coreVersion("0.2.0-beta.1")).toBe("0.2.0")
  })

  it("returns nothing for what is not a version", () => {
    expect(coreVersion("latest")).toBeNull()
  })
})

describe("latestBy", () => {
  it("returns nothing on an empty list", () => {
    expect(latestBy([], (version: string) => version)).toBeNull()
  })

  it("returns the item carrying the highest version", () => {
    const releases = [
      { version: "1.0.0", arch: "amd64" },
      { version: "1.10.0", arch: "arm64" },
      { version: "1.9.0", arch: "amd64" },
    ]

    expect(latestBy(releases, (release) => release.version)).toEqual({
      version: "1.10.0",
      arch: "arm64",
    })
  })

  it("keeps the first of the ties", () => {
    const first = { version: "2.0.0", key: "a" }
    const second = { version: "2.0.0", key: "b" }

    expect(latestBy([first, second], (release) => release.version)).toBe(first)
  })

  it("ranks a pre-release below its version", () => {
    expect(
      latestBy(["1.0.0-beta.1", "1.0.0", "0.9.9"], (version) => version)
    ).toBe("1.0.0")
  })
})
