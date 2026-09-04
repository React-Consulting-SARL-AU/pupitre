import { describe, expect, it } from "bun:test"
import { twoFactorChallenge } from "./two-factor-policy"

function matches(path: string): boolean {
  const [hook] = twoFactorChallenge("http://localhost:3000").hooks?.after ?? []

  if (!hook) {
    throw new Error("the challenge plugin has no after hook")
  }

  return hook.matcher({ path } as Parameters<typeof hook.matcher>[0])
}

describe("twoFactorChallenge", () => {
  it("guards the magic link and the social callback", () => {
    expect(matches("/magic-link/verify")).toBe(true)
    expect(matches("/callback/:id")).toBe(true)
  })

  it("leaves a passkey sign-in alone, it is already a second factor", () => {
    expect(matches("/passkey/verify-authentication")).toBe(false)
  })

  it("leaves the rest of the API alone", () => {
    expect(matches("/get-session")).toBe(false)
    expect(matches("/two-factor/verify-totp")).toBe(false)
    expect(matches("/device/token")).toBe(false)
  })
})
