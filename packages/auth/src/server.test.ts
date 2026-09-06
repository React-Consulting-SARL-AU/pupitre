import { describe, expect, it } from "bun:test"
import type { AuthPrisma } from "./prisma"
import { createAuth, mountedSocialProviders } from "./server"

const DAY = 60 * 60 * 24

const env = {
  BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret",
  BETTER_AUTH_URL: "http://localhost:3000",
  VITE_APP_URL: "http://localhost:3000",
}

const prisma = {} as AuthPrisma

function passkeyOptionsOf(auth: ReturnType<typeof createAuth>) {
  const plugin = auth.options.plugins?.find((entry) => entry.id === "passkey")

  return (plugin as { options: { rpID: string } }).options
}

describe("createAuth", () => {
  it("mounts the expected plugins", () => {
    const auth = createAuth({ prisma, env })
    const ids = (auth.options.plugins ?? []).map((plugin) => plugin.id)

    expect(ids).toEqual([
      "magic-link",
      "two-factor-challenge",
      "device-authorization",
      "bearer",
      "organization",
      "admin",
      "passkey",
      "two-factor",
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

  it("derives the relying party from the auth URL", () => {
    const local = createAuth({ prisma, env })

    expect(local.options.plugins?.find((p) => p.id === "passkey")).toBeDefined()

    const hosted = createAuth({
      prisma,
      env: { ...env, BETTER_AUTH_URL: "https://app.pupitre.studio" },
    })

    expect(passkeyOptionsOf(hosted).rpID).toBe("pupitre.studio")
    expect(passkeyOptionsOf(local).rpID).toBe("localhost")
  })

  it("enables a social provider only when both its credentials are present", () => {
    expect(createAuth({ prisma, env }).options.socialProviders).toEqual({})
    expect(
      createAuth({
        prisma,
        env: { ...env, GITHUB_CLIENT_ID: "id", GOOGLE_CLIENT_ID: "id" },
      }).options.socialProviders
    ).toEqual({})

    const withBoth = createAuth({
      prisma,
      env: {
        ...env,
        GITHUB_CLIENT_ID: "github-id",
        GITHUB_CLIENT_SECRET: "github-secret",
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      },
    })

    expect(withBoth.options.socialProviders?.github?.clientId).toBe("github-id")
    expect(withBoth.options.socialProviders?.google?.clientId).toBe("google-id")
  })

  it("enables one social provider without the other", () => {
    const githubOnly = createAuth({
      prisma,
      env: { ...env, GITHUB_CLIENT_ID: "id", GITHUB_CLIENT_SECRET: "secret" },
    })

    expect(githubOnly.options.socialProviders?.github).toBeDefined()
    expect(githubOnly.options.socialProviders?.google).toBeUndefined()
  })
})

describe("mountedSocialProviders", () => {
  const allCredentials = {
    GITHUB_CLIENT_ID: "github-id",
    GITHUB_CLIENT_SECRET: "github-secret",
    GOOGLE_CLIENT_ID: "google-id",
    GOOGLE_CLIENT_SECRET: "google-secret",
  }

  it("names nothing when no provider is configured", () => {
    expect(mountedSocialProviders(createAuth({ prisma, env }))).toEqual([])
  })

  it("names the provider whose two variables are set", () => {
    const auth = createAuth({
      prisma,
      env: {
        ...env,
        GOOGLE_CLIENT_ID: "google-id",
        GOOGLE_CLIENT_SECRET: "google-secret",
      },
    })

    expect(mountedSocialProviders(auth)).toEqual(["google"])
  })

  it("treats a half-configured provider as absent", () => {
    const auth = createAuth({
      prisma,
      env: { ...env, GOOGLE_CLIENT_ID: "google-id" },
    })

    expect(mountedSocialProviders(auth)).toEqual([])
  })

  it("covers every provider createAuth can mount", () => {
    const auth = createAuth({ prisma, env: { ...env, ...allCredentials } })

    const mounted: string[] = mountedSocialProviders(auth)

    expect(mounted).toEqual(
      Object.keys(auth.options.socialProviders ?? {}).sort()
    )
  })
})
