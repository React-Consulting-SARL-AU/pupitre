import { describe, expect, it } from "bun:test"
import { freshDeviceApproval, isFreshSignIn } from "./fresh-device-approval"

const MINUTE_MS = 60_000

function matches(path: string): boolean {
  const [hook] = freshDeviceApproval().hooks?.before ?? []

  if (!hook) {
    throw new Error("the freshness plugin has no before hook")
  }

  return hook.matcher({ path } as Parameters<typeof hook.matcher>[0])
}

describe("freshDeviceApproval", () => {
  it("guards the confirmation of a device code, and nothing else", () => {
    expect(matches("/device/approve")).toBe(true)
    expect(matches("/device/deny")).toBe(false)
    expect(matches("/device")).toBe(false)
    expect(matches("/device/token")).toBe(false)
  })

  it("holds a sign-in fresh for ten minutes", () => {
    const now = new Date("2026-09-25T10:00:00Z")

    expect(isFreshSignIn(new Date(now.getTime() - 9 * MINUTE_MS), now)).toBe(
      true
    )
    expect(isFreshSignIn(new Date(now.getTime() - 11 * MINUTE_MS), now)).toBe(
      false
    )
    expect(isFreshSignIn("2026-09-25T09:55:00.000Z", now)).toBe(true)
  })
})
