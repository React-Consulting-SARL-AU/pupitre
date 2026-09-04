import { describe, expect, it } from "bun:test"
import {
  APP_REQUIREMENTS,
  detectOs,
  downloadOffers,
  SERVER_REQUIREMENTS,
} from "@/lib/domain/downloads"

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1"
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
const LINUX = "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:129.0) Gecko/20100101"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"

const BASE = "https://downloads.pupitre.test/v1.4.0"

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
    const offers = downloadOffers(null, BASE)

    expect(offers.map((offer) => offer.os)).toEqual([
      "macos",
      "windows",
      "linux",
    ])
    expect(offers.every((offer) => offer.url === null)).toBe(true)
  })

  it("has no link without a publication base, even with a version", () => {
    expect(downloadOffers("1.4.0", null).every((o) => o.url === null)).toBe(
      true
    )
  })

  it("builds one link per system from the published version", () => {
    const offers = downloadOffers("1.4.0", `${BASE}/`)

    expect(offers.map((offer) => offer.url)).toEqual([
      `${BASE}/Pupitre-1.4.0.dmg`,
      `${BASE}/Pupitre-Setup-1.4.0.exe`,
      `${BASE}/Pupitre-1.4.0.AppImage`,
    ])
  })
})

describe("requirements", () => {
  it("states the supported desktop systems", () => {
    expect(APP_REQUIREMENTS.map((line) => line.requirement)).toEqual([
      "macOS 13 ou plus récent",
      "Windows 11",
      "Ubuntu 22.04 ou plus récent",
    ])
  })

  it("states what the server needs", () => {
    expect(SERVER_REQUIREMENTS.join(" ")).toContain("Ubuntu 22.04 ou 24.04")
    expect(SERVER_REQUIREMENTS.join(" ")).toContain("4 Go")
  })
})
