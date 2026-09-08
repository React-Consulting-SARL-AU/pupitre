import { describe, expect, it } from "vitest"
import { detectOs } from "./platform"

const MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
const LINUX = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36"

describe("detectOs", () => {
  it("names the three systems the app ships for", () => {
    expect(detectOs({ userAgent: MAC, platform: "MacIntel" })).toBe("macos")
    expect(detectOs({ userAgent: WINDOWS, platform: "Win32" })).toBe("windows")
    expect(detectOs({ userAgent: LINUX, platform: "Linux x86_64" })).toBe(
      "linux"
    )
  })

  it("claims nothing for a phone or an unknown agent", () => {
    expect(detectOs({ userAgent: ANDROID })).toBeNull()
    expect(detectOs({ userAgent: "curl/8.7.1" })).toBeNull()
  })
})
