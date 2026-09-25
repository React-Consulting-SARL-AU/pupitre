import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { ANNOUNCED_LAUNCH_ENDS_AT } from "@pupitre/shared/plans"
import { describe, expect, it } from "vitest"
import { isLaunchOpen, LAUNCH_ENDS_AT, launchEndDate } from "./launch"

const PLATFORM_CONFIG = fileURLToPath(
  new URL("../../../web/wrangler.jsonc", import.meta.url)
)
const LAUNCH_ENDS_AT_RE = /"LAUNCH_ENDS_AT":\s*"([^"]+)"/g

describe("the launch", () => {
  it("announces the end the platform applies, in every environment", () => {
    const configured = [
      ...readFileSync(PLATFORM_CONFIG, "utf8").matchAll(LAUNCH_ENDS_AT_RE),
    ].map((match) => match[1])

    expect(configured.length).toBeGreaterThan(0)
    for (const value of configured) {
      expect(new Date(value).getTime()).toBe(LAUNCH_ENDS_AT.getTime())
    }
    expect(LAUNCH_ENDS_AT.toISOString().replace(".000", "")).toBe(
      ANNOUNCED_LAUNCH_ENDS_AT
    )
  })

  it("is open until its last second, and closed after", () => {
    const end = LAUNCH_ENDS_AT.getTime()

    expect(isLaunchOpen(new Date(end - 1000))).toBe(true)
    expect(isLaunchOpen(new Date(end))).toBe(false)
  })

  it("writes the last day in UTC, in each language", () => {
    const day = String(LAUNCH_ENDS_AT.getUTCDate())
    const year = String(LAUNCH_ENDS_AT.getUTCFullYear())

    expect(launchEndDate("en")).toMatch(
      new RegExp(`^\\p{L}+ ${day}, ${year}$`, "u")
    )
    expect(launchEndDate("fr")).toMatch(
      new RegExp(`^${day} \\p{L}+ ${year}$`, "u")
    )
  })
})
