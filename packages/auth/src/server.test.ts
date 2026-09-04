import { describe, expect, it } from "bun:test"
import type { AuthPrisma } from "./prisma"
import { createAuth } from "./server"

const DAY = 60 * 60 * 24

const env = {
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  BETTER_AUTH_URL: "http://localhost:3000",
  VITE_APP_URL: "http://localhost:3000",
}

const prisma = {} as AuthPrisma

describe("createAuth", () => {
  it("mounts the expected plugins", () => {
    const auth = createAuth({ prisma, env })
    const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id)

    expect(ids).toEqual([
      "magic-link",
      "device-authorization",
      "bearer",
      "organization",
      "admin",
      "open-api",
      "tanstack-start-cookies",
    ])
    expect(typeof auth.handler).toBe("function")
  })

  it("keeps sessions 60 days, renewed daily, with rate limiting on", () => {
    const auth = createAuth({ prisma, env })

    expect(auth.options.session?.expiresIn).toBe(60 * DAY)
    expect(auth.options.session?.updateAge).toBe(DAY)
    expect(auth.options.rateLimit?.enabled).toBe(true)
    expect(auth.options.advanced?.ipAddress?.ipAddressHeaders).toEqual([
      "cf-connecting-ip",
    ])
  })

  it("sets HttpOnly, SameSite=Lax cookies, Secure outside localhost", () => {
    const local = createAuth({ prisma, env })

    expect(local.options.advanced?.useSecureCookies).toBe(false)
    expect(local.options.advanced?.defaultCookieAttributes).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
    })

    const hosted = createAuth({
      prisma,
      env: {
        ...env,
        BETTER_AUTH_URL: "https://staging-app.pupitre.studio",
        VITE_APP_URL: "https://staging-app.pupitre.studio",
      },
    })

    expect(hosted.options.advanced?.useSecureCookies).toBe(true)
    expect(hosted.options.advanced?.defaultCookieAttributes?.secure).toBe(true)
  })

  it("trusts the auth and console origins only", () => {
    const auth = createAuth({
      prisma,
      env: {
        ...env,
        BETTER_AUTH_URL: "https://staging-app.pupitre.studio/",
        VITE_APP_URL: "https://console.pupitre.studio/dashboard",
      },
    })

    expect(auth.options.trustedOrigins).toEqual([
      "https://staging-app.pupitre.studio",
      "https://console.pupitre.studio",
    ])
  })

  it("enables GitHub only when both credentials are present", () => {
    expect(createAuth({ prisma, env }).options.socialProviders).toEqual({})
    expect(
      createAuth({ prisma, env: { ...env, GITHUB_CLIENT_ID: "id" } }).options
        .socialProviders
    ).toEqual({})

    const withGithub = createAuth({
      prisma,
      env: { ...env, GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" },
    })

    expect(withGithub.options.socialProviders?.github?.clientId).toBe("id")
  })
})
