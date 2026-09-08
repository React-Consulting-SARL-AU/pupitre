import { describe, expect, it } from "bun:test"
import {
  compareVersions,
  coreVersion,
  isNewer,
  isSemver,
  latestBy,
} from "./index"

describe("isSemver", () => {
  it("accepte une version publiée et une préversion", () => {
    expect(isSemver("1.2.3")).toBe(true)
    expect(isSemver("0.2.0-beta.1")).toBe(true)
  })

  it("refuse ce qui n'est pas une version", () => {
    expect(isSemver("v1.2.3")).toBe(false)
    expect(isSemver("1.2")).toBe(false)
  })
})

describe("compareVersions", () => {
  it("ordonne les numéros de version", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBeLessThan(0)
    expect(compareVersions("1.10.0", "1.9.0")).toBeGreaterThan(0)
    expect(compareVersions("2.0.0", "2.0.0")).toBe(0)
  })

  it("place une préversion avant sa version", () => {
    expect(compareVersions("1.0.0-beta.1", "1.0.0")).toBeLessThan(0)
    expect(compareVersions("1.0.0-beta.2", "1.0.0-beta.10")).toBeLessThan(0)
  })
})

describe("isNewer", () => {
  it("tient toute version pour plus récente que rien", () => {
    expect(isNewer("0.1.0", null)).toBe(true)
  })

  it("refuse une version égale ou plus ancienne", () => {
    expect(isNewer("1.0.0", "1.0.0")).toBe(false)
    expect(isNewer("0.9.0", "1.0.0")).toBe(false)
  })
})

describe("coreVersion", () => {
  it("retire la préversion", () => {
    expect(coreVersion("0.2.0-beta.1")).toBe("0.2.0")
  })

  it("ne répond rien pour ce qui n'est pas une version", () => {
    expect(coreVersion("latest")).toBeNull()
  })
})

describe("latestBy", () => {
  it("ne répond rien sur une liste vide", () => {
    expect(latestBy([], (version: string) => version)).toBeNull()
  })

  it("rend l'élément qui porte la version la plus haute", () => {
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

  it("garde le premier des ex æquo", () => {
    const first = { version: "2.0.0", key: "a" }
    const second = { version: "2.0.0", key: "b" }

    expect(latestBy([first, second], (release) => release.version)).toBe(first)
  })

  it("classe une préversion sous sa version", () => {
    expect(
      latestBy(["1.0.0-beta.1", "1.0.0", "0.9.9"], (version) => version)
    ).toBe("1.0.0")
  })
})
