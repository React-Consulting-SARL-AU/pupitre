import { afterEach, describe, expect, it } from "bun:test"
import {
  buildEnvelope,
  buildEvent,
  parseDsn,
  redactPath,
  reportException,
  type TObservabilityEnv,
} from "./sentry"

const DSN = "https://publickey@o1.ingest.sentry.io/4507"
const NOW = new Date("2026-09-04T10:00:00.000Z")
const EVENT_ID = "0000000000004000800000000000abcd"

const originalFetch = globalThis.fetch

interface TCall {
  url: string
  body: string
  headers: Headers
}

function captureFetch(calls: TCall[]): void {
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      body: String(init?.body ?? ""),
      headers: new Headers(init?.headers),
    })

    return Promise.resolve(new Response(null, { status: 200 }))
  }) as unknown as typeof fetch
}

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("le DSN", () => {
  it("donne l'adresse d'envoi et la clé publique", () => {
    expect(parseDsn(DSN)).toEqual({
      endpoint: "https://o1.ingest.sentry.io/api/4507/envelope/",
      publicKey: "publickey",
    })
  })

  it("est absent ou illisible : rien n'est envoyé", () => {
    expect(parseDsn(undefined)).toBeNull()
    expect(parseDsn("")).toBeNull()
    expect(parseDsn("pas-une-url")).toBeNull()
    expect(parseDsn("https://o1.ingest.sentry.io/4507")).toBeNull()
  })
})

describe("le chemin envoyé", () => {
  it("garde la forme de la route", () => {
    expect(redactPath("/dashboard/servers")).toBe("/dashboard/servers")
    expect(redactPath("/api/v1/me/devices")).toBe("/api/v1/me/devices")
    expect(redactPath("/auth/sign-in")).toBe("/auth/sign-in")
  })

  it("remplace tout ce qui ressemble à un identifiant", () => {
    expect(redactPath("/dashboard/servers/cmf3k2l9x0000abcd1234")).toBe(
      "/dashboard/servers/:id"
    )
    expect(
      redactPath("/auth/invitation/3f1c0b6e-9a2d-4c7f-8b1a-0d5e6f7a8b9c")
    ).toBe("/auth/invitation/:id")
  })
})

describe("l'événement", () => {
  const env: TObservabilityEnv = {
    SENTRY_DSN: DSN,
    PUPITRE_ENVIRONMENT: "staging",
  }

  it("porte l'environnement, la route et le type de l'erreur", () => {
    const event = buildEvent(
      new TypeError("le serveur n'a pas répondu"),
      env,
      { method: "GET", pathname: "/api/v1/servers/cmf3k2l9x0000abcd1234" },
      NOW,
      EVENT_ID
    )

    expect(event.environment).toBe("staging")
    expect(event.transaction).toBe("/api/v1/servers/:id")
    expect(event.tags.method).toBe("GET")
    expect(event.exception.values[0]).toMatchObject({
      type: "TypeError",
      value: "le serveur n'a pas répondu",
    })
  })

  it("nomme le cron quand la tâche planifiée échoue", () => {
    const event = buildEvent(
      new Error("workflow refusé"),
      env,
      { cron: "*/5 * * * *" },
      NOW,
      EVENT_ID
    )

    expect(event.tags.cron).toBe("*/5 * * * *")
    expect(event.transaction).toBeUndefined()
  })

  it("se replie sur un environnement inconnu", () => {
    const event = buildEvent("boum", { SENTRY_DSN: DSN }, {}, NOW, EVENT_ID)

    expect(event.environment).toBe("unknown")
    expect(event.exception.values[0].type).toBe("UnknownError")
  })

  it("s'enveloppe en trois lignes JSON", () => {
    const event = buildEvent(new Error("boum"), env, {}, NOW, EVENT_ID)
    const lines = buildEnvelope(event, NOW).trim().split("\n")

    expect(lines).toHaveLength(3)
    expect(JSON.parse(lines[0]).event_id).toBe(EVENT_ID)
    expect(JSON.parse(lines[1])).toEqual({ type: "event" })
    expect(JSON.parse(lines[2]).exception.values[0].value).toBe("boum")
  })
})

describe("l'envoi", () => {
  it("ne part pas sans DSN", async () => {
    const calls: TCall[] = []
    captureFetch(calls)

    await reportException(new Error("boum"), { PUPITRE_ENVIRONMENT: "staging" })

    expect(calls).toHaveLength(0)
  })

  it("poste l'enveloppe signée de la clé publique", async () => {
    const calls: TCall[] = []
    captureFetch(calls)

    await reportException(
      new Error("boum"),
      { SENTRY_DSN: DSN, PUPITRE_ENVIRONMENT: "production" },
      { method: "POST", pathname: "/api/v1/servers/cmf3k2l9x0000abcd1234" }
    )

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://o1.ingest.sentry.io/api/4507/envelope/")
    expect(calls[0].headers.get("x-sentry-auth")).toContain(
      "sentry_key=publickey"
    )
    expect(calls[0].body).toContain("/api/v1/servers/:id")
    expect(calls[0].body).not.toContain("cmf3k2l9x0000abcd1234")
  })

  it("avale son propre échec", async () => {
    globalThis.fetch = (() =>
      Promise.reject(new Error("réseau"))) as unknown as typeof fetch

    expect(
      await reportException(new Error("boum"), { SENTRY_DSN: DSN })
    ).toBeUndefined()
  })
})
