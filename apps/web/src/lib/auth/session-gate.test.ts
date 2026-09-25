import { describe, expect, it } from "bun:test"
import { ApiError } from "@pupitre/api/client"
import type { QueryClient } from "@tanstack/react-query"
import { isRedirect } from "@tanstack/react-router"
import { readSessionOrSignIn, requireSession } from "@/lib/auth/session-gate"

function gate(answer: () => Promise<unknown>) {
  return {
    context: {
      queryClient: { ensureQueryData: answer } as unknown as QueryClient,
    },
    location: { href: "/auth/invitation/inv_1" },
  }
}

describe("requireSession", () => {
  it("sends a visitor without a session to sign in, and back here after", async () => {
    let thrown: unknown = null

    try {
      await requireSession(gate(() => Promise.reject(new Error("401"))))
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    expect((thrown as { options: { to: string } }).options.to).toBe(
      "/auth/sign-in"
    )
    expect(
      (thrown as { options: { search: { callbackURL: string } } }).options
        .search.callbackURL
    ).toBe("/auth/invitation/inv_1")
  })

  it("lets a signed-in person through", async () => {
    await expect(
      requireSession(gate(() => Promise.resolve({ user: { id: "u1" } })))
    ).resolves.toBeUndefined()
  })
})

describe("readSessionOrSignIn", () => {
  it("sends an expired session to sign in, and back to the page it was on", async () => {
    let thrown: unknown = null

    try {
      await readSessionOrSignIn(
        gate(() => Promise.reject(new ApiError(401, {}, "401")))
      )
    } catch (error) {
      thrown = error
    }

    expect(isRedirect(thrown)).toBe(true)
    expect(
      (thrown as { options: { search: { callbackURL: string } } }).options
        .search.callbackURL
    ).toBe("/auth/invitation/inv_1")
  })

  it("keeps a platform failure or a network cut on the page, to be retried", async () => {
    await expect(
      readSessionOrSignIn(gate(() => Promise.reject(new ApiError(500, {}, ""))))
    ).resolves.toBeNull()
    await expect(
      readSessionOrSignIn(gate(() => Promise.reject(new TypeError("offline"))))
    ).resolves.toBeNull()
  })
})
