import { describe, expect, it } from "bun:test"
import { artefactUrl } from "../../lib/releases/app-releases"
import {
  acceptedPublishTokens,
  isPublishToken,
  PREVIOUS_PUBLISH_TOKEN_VARIABLE,
  PUBLISH_TOKEN_PREFIX,
  PUBLISH_TOKEN_VARIABLE,
  verifyPublishToken,
} from "../../lib/releases/publish-token"

const CURRENT = `${PUBLISH_TOKEN_PREFIX}the-current-one`

const PREVIOUS = `${PUBLISH_TOKEN_PREFIX}the-one-before`

function env(current?: string, previous?: string) {
  return {
    [PUBLISH_TOKEN_VARIABLE]: current,
    [PREVIOUS_PUBLISH_TOKEN_VARIABLE]: previous,
  }
}

describe("what looks like a publish token", () => {
  it("is recognized by its prefix", () => {
    expect(isPublishToken(CURRENT)).toBe(true)
    expect(isPublishToken("pupitre_srv_something")).toBe(false)
    expect(isPublishToken("a-session-token")).toBe(false)
  })
})

describe("the accepted tokens", () => {
  it("are those the platform declares, without the empty ones", () => {
    expect(acceptedPublishTokens(env(CURRENT, PREVIOUS))).toEqual([
      CURRENT,
      PREVIOUS,
    ])
    expect(acceptedPublishTokens(env(CURRENT))).toEqual([CURRENT])
    expect(acceptedPublishTokens(env(" ", ""))).toEqual([])
    expect(acceptedPublishTokens(env())).toEqual([])
  })
})

describe("verification", () => {
  it("accepts the current token", async () => {
    expect(await verifyPublishToken(CURRENT, env(CURRENT))).toBe(true)
  })

  it("still accepts the previous one, for the duration of a rotation", async () => {
    expect(await verifyPublishToken(PREVIOUS, env(CURRENT, PREVIOUS))).toBe(
      true
    )
  })

  it("refuses the previous one once it is removed", async () => {
    expect(await verifyPublishToken(PREVIOUS, env(CURRENT))).toBe(false)
  })

  it("refuses when the platform declares none", async () => {
    expect(await verifyPublishToken(CURRENT, env())).toBe(false)
  })

  it("refuses a prefix of the token, and the token followed by anything", async () => {
    expect(await verifyPublishToken(CURRENT.slice(0, -1), env(CURRENT))).toBe(
      false
    )
    expect(await verifyPublishToken(`${CURRENT}x`, env(CURRENT))).toBe(false)
    expect(await verifyPublishToken("", env(CURRENT))).toBe(false)
  })
})

describe("an artifact's address", () => {
  const KEY = "app/1.4.0/Pupitre-1.4.0-arm64.dmg"

  it("is composed from the declared bucket", () => {
    expect(
      artefactUrl(KEY, { PUPITRE_DOWNLOADS_URL: "https://dl.pupitre.studio" })
    ).toBe(`https://dl.pupitre.studio/${KEY}`)
  })

  it("tolerates a variable with a trailing slash", () => {
    expect(
      artefactUrl(KEY, { PUPITRE_DOWNLOADS_URL: "https://dl.pupitre.studio//" })
    ).toBe(`https://dl.pupitre.studio/${KEY}`)
  })

  it("says nothing will be downloaded when no bucket is declared", () => {
    expect(artefactUrl(KEY, {})).toBe(`http://localhost/__downloads/${KEY}`)
  })

  // The `r2_key` pattern already rejects such keys; this guards composition if one slips through.
  it("does not leave the host, even on a key that escaped the pattern", () => {
    const escaped = artefactUrl("//evil.example/x", {
      PUPITRE_DOWNLOADS_URL: "https://dl.pupitre.studio",
    })

    expect(new URL(escaped).host).toBe("dl.pupitre.studio")
  })
})
