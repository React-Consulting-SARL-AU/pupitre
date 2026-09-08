import { describe, expect, it } from "bun:test"
import {
  APP_REQUIREMENTS,
  detectOs,
  downloadOffers,
  type PublishedAppRelease,
  SERVER_REQUIREMENTS,
} from "@/lib/domain/downloads"
import { translator } from "@/lib/i18n/i18n"

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1"
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
const LINUX = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:129.0) Gecko/20100101"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"

const BASE = "https://downloads.pupitre.test/1.4.0"

const RELEASE: PublishedAppRelease = {
  version: "1.4.0",
  notes: "Première version signée.",
  builds: [
    { os: "macos", arch: "arm64", url: `${BASE}/Pupitre-1.4.0-arm64.dmg` },
    { os: "macos", arch: "x64", url: `${BASE}/Pupitre-1.4.0-x64.dmg` },
    { os: "windows", arch: "x64", url: `${BASE}/Pupitre-Setup-1.4.0-x64.exe` },
    { os: "linux", arch: "x64", url: `${BASE}/Pupitre-1.4.0-x64.AppImage` },
  ],
}

describe("detectOs", () => {
  it("recognises the three desktop systems", () => {
    expect(detectOs(MAC)).toBe("macos")
    expect(detectOs(WINDOWS)).toBe("windows")
    expect(detectOs(LINUX)).toBe("linux")
  })

  it("stays silent on a phone or an unknown agent", () => {
    expect(detectOs(ANDROID)).toBeNull()
    expect(detectOs("")).toBeNull()
  })
})

describe("downloadOffers", () => {
  it("lists the three systems even when nothing is published", () => {
    const offers = downloadOffers(null)

    expect(offers.map((offer) => offer.os)).toEqual([
      "macos",
      "windows",
      "linux",
    ])
    expect(offers.every((offer) => offer.url === null)).toBe(true)
  })

  it("takes one link per artefact from the published release", () => {
    const offers = downloadOffers(RELEASE)

    expect(offers.map((offer) => offer.url)).toEqual([
      `${BASE}/Pupitre-1.4.0-arm64.dmg`,
      `${BASE}/Pupitre-1.4.0-x64.dmg`,
      `${BASE}/Pupitre-Setup-1.4.0-x64.exe`,
      `${BASE}/Pupitre-1.4.0-x64.AppImage`,
    ])
    expect(offers.map((offer) => offer.arch)).toEqual([
      "arm64",
      "x64",
      "x64",
      "x64",
    ])
  })

  it("leaves a system without a build without a link", () => {
    const offers = downloadOffers({
      ...RELEASE,
      builds: RELEASE.builds.filter((build) => build.os === "macos"),
    })

    expect(offers.map((offer) => offer.url !== null)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })
})

describe("requirements", () => {
  const t = translator("fr")

  it("states the supported desktop systems", () => {
    expect(APP_REQUIREMENTS.map((line) => t(line.requirement))).toEqual([
      "macOS 13 ou plus récent",
      "Windows 11",
      "Ubuntu 22.04 ou plus récent",
    ])
  })

  it("states what the server needs", () => {
    const written = SERVER_REQUIREMENTS.map((line) => t(line)).join(" ")

    expect(written).toContain("Ubuntu 22.04 ou 24.04")
    expect(written).toContain("4 Go")
  })
})
