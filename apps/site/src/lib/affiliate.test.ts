import { AFFILIATE_COOKIE } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import {
  AFFILIATE_BOOT_SCRIPT,
  AFFILIATE_COOKIE_MAX_AGE,
  AFFILIATE_QUERY,
} from "./affiliate"

interface FakeWindow {
  location: { search: string; hostname: string }
  document: { cookie: string }
}

function run(search: string, hostname: string): string {
  const fake: FakeWindow = {
    location: { search, hostname },
    document: { cookie: "" },
  }
  const script = new Function(
    "location",
    "document",
    "URLSearchParams",
    AFFILIATE_BOOT_SCRIPT
  )

  script(fake.location, fake.document, URLSearchParams)

  return fake.document.cookie
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
})
