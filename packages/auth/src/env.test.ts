import { describe, expect, it } from "bun:test"
import { isLocalhostUrl, readAuthEnv, trustedOrigins } from "./env"

describe("readAuthEnv", () => {
  it("requires the secret and the base URL", () => {
    expect(() => readAuthEnv({})).toThrow("BETTER_AUTH_SECRET")
    expect(() => readAuthEnv({ BETTER_AUTH_SECRET: "s" })).toThrow(
      "BETTER_AUTH_URL"
    )
  })

  it("drops blank optional values", () => {
    const env = readAuthEnv({
      BETTER_AUTH_SECRET: "s",
      BETTER_AUTH_URL: "http://localhost:3000",
      GITHUB_CLIENT_ID: "  ",
      VITE_APP_URL: "",
    })

    expect(env.GITHUB_CLIENT_ID).toBeUndefined()
    expect(env.VITE_APP_URL).toBeUndefined()
  })
})

describe("isLocalhostUrl", () => {
  it("recognises loopback hosts only", () => {
    expect(isLocalhostUrl("http://localhost:3000")).toBe(true)
    expect(isLocalhostUrl("http://127.0.0.1:3000")).toBe(true)
    expect(isLocalhostUrl("https://app.pupitre.sh")).toBe(false)
    expect(isLocalhostUrl("https://localhost.pupitre.sh")).toBe(false)
  })
})

describe("trustedOrigins", () => {
  it("dedupes origins and strips paths", () => {
    expect(
      trustedOrigins({
        BETTER_AUTH_SECRET: "s",
        BETTER_AUTH_URL: "http://localhost:3000/",
        VITE_APP_URL: "http://localhost:3000/dashboard",
      })
    ).toEqual(["http://localhost:3000"])
  })
})
