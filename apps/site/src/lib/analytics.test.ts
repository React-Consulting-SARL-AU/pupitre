import { describe, expect, it } from "vitest"
import {
  CONSENT_KEY,
  parseConsent,
  posthogOptions,
  readConsent,
} from "./analytics"

const storage = (value: string | null) => ({ getItem: () => value })

describe("consent", () => {
  it("reads only the two answers it wrote", () => {
    expect(parseConsent("granted")).toBe("granted")
    expect(parseConsent("denied")).toBe("denied")
    expect(parseConsent("maybe")).toBeNull()
    expect(parseConsent(null)).toBeNull()
  })

  it("treats a browser that refuses storage as undecided", () => {
    expect(readConsent(storage("granted"))).toBe("granted")
    expect(readConsent(storage(null))).toBeNull()
    expect(
      readConsent({
        getItem: () => {
          throw new Error("blocked")
        },
      })
    ).toBeNull()
  })

  it("names its key once", () => {
    expect(CONSENT_KEY).toBe("pupitre_analytics")
  })
})

describe("posthogOptions", () => {
  it("keeps page views anonymous and writes no cookie", () => {
    const options = posthogOptions("https://eu.i.posthog.com")

    expect(options.persistence).toBe("memory")
    expect(options.autocapture).toBe(false)
    expect(options.capture_pageview).toBe(true)
    expect(options.disable_session_recording).toBe(true)
    expect(options.api_host).toBe("https://eu.i.posthog.com")
  })
})
