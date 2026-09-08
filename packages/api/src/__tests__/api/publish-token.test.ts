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

describe("ce qui ressemble à un jeton de publication", () => {
  it("se reconnaît à son préfixe", () => {
    expect(isPublishToken(CURRENT)).toBe(true)
    expect(isPublishToken("pupitre_srv_something")).toBe(false)
    expect(isPublishToken("a-session-token")).toBe(false)
  })
})

describe("les jetons acceptés", () => {
  it("sont ceux que la plateforme déclare, sans les vides", () => {
    expect(acceptedPublishTokens(env(CURRENT, PREVIOUS))).toEqual([
      CURRENT,
      PREVIOUS,
    ])
    expect(acceptedPublishTokens(env(CURRENT))).toEqual([CURRENT])
    expect(acceptedPublishTokens(env(" ", ""))).toEqual([])
    expect(acceptedPublishTokens(env())).toEqual([])
  })
})

describe("la vérification", () => {
  it("accepte le jeton courant", async () => {
    expect(await verifyPublishToken(CURRENT, env(CURRENT))).toBe(true)
  })

  it("accepte encore le précédent, le temps d'une rotation", async () => {
    expect(await verifyPublishToken(PREVIOUS, env(CURRENT, PREVIOUS))).toBe(
      true
    )
  })

  it("refuse le précédent une fois qu'il est retiré", async () => {
    expect(await verifyPublishToken(PREVIOUS, env(CURRENT))).toBe(false)
  })

  it("refuse quand la plateforme n'en déclare aucun", async () => {
    expect(await verifyPublishToken(CURRENT, env())).toBe(false)
  })

  it("refuse un préfixe du jeton, et le jeton suivi de n'importe quoi", async () => {
    expect(await verifyPublishToken(CURRENT.slice(0, -1), env(CURRENT))).toBe(
      false
    )
    expect(await verifyPublishToken(`${CURRENT}x`, env(CURRENT))).toBe(false)
    expect(await verifyPublishToken("", env(CURRENT))).toBe(false)
  })
})

describe("l'adresse d'un artefact", () => {
  const KEY = "app/1.4.0/Pupitre-1.4.0-arm64.dmg"

  it("se compose depuis le seau déclaré", () => {
    expect(
      artefactUrl(KEY, { PUPITRE_DOWNLOADS_URL: "https://dl.pupitre.studio" })
    ).toBe(`https://dl.pupitre.studio/${KEY}`)
  })

  it("supporte une variable qui traîne une barre finale", () => {
    expect(
      artefactUrl(KEY, { PUPITRE_DOWNLOADS_URL: "https://dl.pupitre.studio//" })
    ).toBe(`https://dl.pupitre.studio/${KEY}`)
  })

  it("dit que rien ne sera téléchargé quand aucun seau n'est déclaré", () => {
    expect(artefactUrl(KEY, {})).toBe(`http://localhost/__downloads/${KEY}`)
  })

  // The pattern on `r2_key` is what keeps such a key out of the table; this
  // says what composition does with one anyway, and it stays on our host.
  it("ne quitte pas l'hôte, même sur une clé qui a échappé au motif", () => {
    const escaped = artefactUrl("//evil.example/x", {
      PUPITRE_DOWNLOADS_URL: "https://dl.pupitre.studio",
    })

    expect(new URL(escaped).host).toBe("dl.pupitre.studio")
  })
})
