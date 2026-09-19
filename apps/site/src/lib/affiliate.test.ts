import { AFFILIATE_COOKIE } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import {
  AFFILIATE_BOOT_SCRIPT,
  AFFILIATE_COOKIE_MAX_AGE,
  AFFILIATE_HIT_MARKER,
  AFFILIATE_HIT_URL_PREFIX,
  AFFILIATE_QUERY,
} from "./affiliate"

interface Visit {
  cookie: string
  beacons: string[]
  marks: Map<string, string>
}

interface VisitOptions {
  marks?: Map<string, string>
  storageThrows?: boolean
}

function visit(
  search: string,
  hostname: string,
  {
    marks = new Map<string, string>(),
    storageThrows = false,
  }: VisitOptions = {}
): Visit {
  const beacons: string[] = []
  const location = { search, hostname }
  const document = { cookie: "" }
  const navigator = {
    sendBeacon: (url: string) => {
      beacons.push(url)

      return true
    },
  }
  const sessionStorage = {
    getItem: (key: string) => {
      if (storageThrows) {
        throw new Error("storage is blocked")
      }

      return marks.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      marks.set(key, value)
    },
  }
  const script = new Function(
    "location",
    "document",
    "navigator",
    "sessionStorage",
    "URLSearchParams",
    AFFILIATE_BOOT_SCRIPT
  )

  script(location, document, navigator, sessionStorage, URLSearchParams)

  return { cookie: document.cookie, beacons, marks }
}

function run(search: string, hostname: string): string {
  return visit(search, hostname).cookie
}

describe("AFFILIATE_BOOT_SCRIPT", () => {
  it("keeps a valid code for the whole domain in production", () => {
    expect(run(`?${AFFILIATE_QUERY}=launch-2026`, "pupitre.studio")).toBe(
      `${AFFILIATE_COOKIE}=launch-2026;Path=/;Max-Age=${AFFILIATE_COOKIE_MAX_AGE};SameSite=Lax;Domain=.pupitre.studio`
    )
  })

  it("keeps the cookie on the host alone elsewhere", () => {
    expect(run("?ref=abc123", "localhost")).toBe(
      `${AFFILIATE_COOKIE}=abc123;Path=/;Max-Age=${AFFILIATE_COOKIE_MAX_AGE};SameSite=Lax`
    )
    expect(run("?ref=abc123", "notpupitre.studio")).not.toContain("Domain=")
    expect(run("?ref=abc123", "www.pupitre.studio")).toContain(
      "Domain=.pupitre.studio"
    )
  })

  it("ignores a missing or malformed code", () => {
    expect(run("", "pupitre.studio")).toBe("")
    expect(run("?ref=Not%20A%20Code", "pupitre.studio")).toBe("")
    expect(run("?ref=ab", "pupitre.studio")).toBe("")
    expect(run("?utm=x", "pupitre.studio")).toBe("")
  })

  it("lasts ninety days", () => {
    expect(AFFILIATE_COOKIE_MAX_AGE).toBe(90 * 86_400)
  })

  it("counts the visit on the console", () => {
    const { beacons, marks } = visit("?ref=launch-2026", "pupitre.studio")

    expect(AFFILIATE_HIT_URL_PREFIX).toBe(
      "https://app.pupitre.studio/api/v1/affiliate/"
    )
    expect(beacons).toEqual([`${AFFILIATE_HIT_URL_PREFIX}launch-2026/hit`])
    expect([...marks.keys()]).toEqual([`${AFFILIATE_HIT_MARKER}:launch-2026`])
  })

  it("counts a visit once per session, and each code apart", () => {
    const marks = new Map<string, string>()
    const first = visit("?ref=launch-2026", "pupitre.studio", { marks })
    const again = visit("?ref=launch-2026", "pupitre.studio", { marks })
    const other = visit("?ref=podcast-42", "pupitre.studio", { marks })

    expect(first.beacons).toHaveLength(1)
    expect(again.beacons).toEqual([])
    expect(other.beacons).toEqual([`${AFFILIATE_HIT_URL_PREFIX}podcast-42/hit`])
  })

  it("counts nothing for a code the page never carried", () => {
    expect(visit("?ref=Not%20A%20Code", "pupitre.studio").beacons).toEqual([])
    expect(visit("", "pupitre.studio").beacons).toEqual([])
  })

  it("keeps the cookie when storage is blocked", () => {
    const blocked = visit("?ref=launch-2026", "pupitre.studio", {
      storageThrows: true,
    })

    expect(blocked.cookie).toContain(`${AFFILIATE_COOKIE}=launch-2026`)
    expect(blocked.beacons).toEqual([])
  })
})
