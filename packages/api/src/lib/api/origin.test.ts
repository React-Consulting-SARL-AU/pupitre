import { describe, expect, it } from "bun:test"
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal"
import { isForeignCookieWrite, isForeignOrigin } from "./origin"

const URL_OF_THE_API = `${PUPITRE_ORIGINS.app}/api/v1/orgs/org_1/invitations`

function request(
  method: string,
  headers: Record<string, string>,
  url = URL_OF_THE_API
): Request {
  return new Request(url, { method, headers })
}

const SESSION_COOKIE = { cookie: "__Secure-better-auth.session_token=abc" }

describe("isForeignCookieWrite", () => {
  it("refuses a write a sibling subdomain sends with the session cookie", () => {
    expect(
      isForeignCookieWrite(
        request("POST", {
          ...SESSION_COOKIE,
          origin: "https://user-content.pupitre.studio",
        })
      )
    ).toBe(true)
  })

  it("lets the console, the site's beacon and the local console write", () => {
    for (const origin of [PUPITRE_ORIGINS.app, PUPITRE_ORIGINS.site]) {
      expect(
        isForeignCookieWrite(request("POST", { ...SESSION_COOKIE, origin }))
      ).toBe(false)
    }

    expect(
      isForeignCookieWrite(
        request(
          "DELETE",
          { ...SESSION_COOKIE, origin: "http://localhost:3000" },
          "http://localhost:3000/api/v1/me"
        )
      )
    ).toBe(false)
    expect(
      isForeignCookieWrite(
        request(
          "POST",
          { ...SESSION_COOKIE, origin: "http://localhost:4321" },
          "http://localhost:3000/api/v1/affiliate/ada/hit"
        )
      )
    ).toBe(false)
  })

  it("leaves a bearer request, a read and a request without a browser alone", () => {
    const foreign = { origin: "https://evil.example" }

    expect(
      isForeignCookieWrite(
        request("POST", { ...foreign, authorization: "Bearer tok" })
      )
    ).toBe(false)
    expect(
      isForeignCookieWrite(request("GET", { ...SESSION_COOKIE, ...foreign }))
    ).toBe(false)
    expect(isForeignCookieWrite(request("POST", SESSION_COOKIE))).toBe(false)
  })

  it("refuses the opaque origin a sandboxed frame sends", () => {
    expect(
      isForeignCookieWrite(
        request("PATCH", { ...SESSION_COOKIE, origin: "null" })
      )
    ).toBe(true)
  })
})

describe("isForeignOrigin", () => {
  it("tells a socket opened from another site from one the console opens", () => {
    expect(
      isForeignOrigin(request("GET", { origin: "https://evil.example" }))
    ).toBe(true)
    expect(
      isForeignOrigin(request("GET", { origin: PUPITRE_ORIGINS.app }))
    ).toBe(false)
  })
})
