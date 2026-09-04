import { describe, expect, it } from "bun:test"
import {
  type AlertState,
  DISK_ALERT_PERCENT,
  detectAlerts,
  isAgentOutdated,
  isDiskHigh,
  isEntitlementGrace,
  isUnreachable,
  latestVersionOf,
  OUTDATED_AFTER_VERSIONS,
  UNREACHABLE_AFTER_MS,
  versionsBehind,
} from "./detect"

const NOW = new Date("2026-09-04T12:00:00Z")

const MINUTE_MS = 60_000

function state(overrides: Partial<AlertState> = {}): AlertState {
  return {
    status: "active",
    createdAt: new Date("2026-09-01T00:00:00Z"),
    lastHeartbeatAt: new Date(NOW.getTime() - MINUTE_MS),
    disk: 12,
    agentVersion: "1.4.0",
    publishedVersions: ["1.4.0"],
    ...overrides,
  }
}

function minutesAgo(minutes: number): Date {
  return new Date(NOW.getTime() - minutes * MINUTE_MS)
}

describe("serveur injoignable", () => {
  it("se déclenche après trente minutes sans heartbeat", () => {
    expect(UNREACHABLE_AFTER_MS).toBe(30 * MINUTE_MS)
    expect(isUnreachable(state({ lastHeartbeatAt: minutesAgo(31) }), NOW)).toBe(
      true
    )
  })

  it("laisse passer un serveur vu il y a vingt-neuf minutes", () => {
    expect(isUnreachable(state({ lastHeartbeatAt: minutesAgo(29) }), NOW)).toBe(
      false
    )
  })

  it("compte depuis l'enrôlement quand aucun heartbeat n'est arrivé", () => {
    expect(
      isUnreachable(
        state({ lastHeartbeatAt: null, createdAt: minutesAgo(45) }),
        NOW
      )
    ).toBe(true)
    expect(
      isUnreachable(
        state({ lastHeartbeatAt: null, createdAt: minutesAgo(5) }),
        NOW
      )
    ).toBe(false)
  })

  it("ignore un serveur en enrôlement, suspendu ou révoqué", () => {
    for (const status of ["enrolling", "suspended", "revoked"] as const) {
      expect(
        isUnreachable(state({ status, lastHeartbeatAt: minutesAgo(120) }), NOW)
      ).toBe(false)
    }
  })
})

describe("disque au-dessus de 90 %", () => {
  it("se déclenche à 91 %", () => {
    expect(DISK_ALERT_PERCENT).toBe(90)
    expect(isDiskHigh(state({ disk: 91 }))).toBe(true)
  })

  it("laisse passer 90 % pile et 89 %", () => {
    expect(isDiskHigh(state({ disk: 90 }))).toBe(false)
    expect(isDiskHigh(state({ disk: 89 }))).toBe(false)
  })

  it("ne décide rien sans mesure", () => {
    expect(isDiskHigh(state({ disk: null }))).toBe(false)
  })
})

describe("agent périmé", () => {
  it("compte les versions publiées plus récentes", () => {
    expect(
      versionsBehind(
        state({
          agentVersion: "1.4.0",
          publishedVersions: ["1.3.0", "1.4.0", "1.5.0", "1.6.0"],
        })
      )
    ).toBe(2)
  })

  it("se déclenche à deux versions de retard", () => {
    expect(OUTDATED_AFTER_VERSIONS).toBe(2)
    expect(
      isAgentOutdated(
        state({ agentVersion: "1.4.0", publishedVersions: ["1.5.0", "1.6.0"] })
      )
    ).toBe(true)
  })

  it("laisse passer une seule version de retard", () => {
    expect(
      isAgentOutdated(
        state({ agentVersion: "1.4.0", publishedVersions: ["1.5.0"] })
      )
    ).toBe(false)
  })

  it("ne décide rien tant que l'agent n'a pas dit sa version", () => {
    expect(
      isAgentOutdated(
        state({ agentVersion: null, publishedVersions: ["1.5.0", "1.6.0"] })
      )
    ).toBe(false)
  })

  it("nomme la version publiée la plus récente", () => {
    expect(latestVersionOf(["1.9.0", "1.10.0", "1.2.0"])).toBe("1.10.0")
    expect(latestVersionOf([])).toBeNull()
  })
})

describe("droit d'usage en tolérance", () => {
  it("suit le statut du serveur", () => {
    expect(isEntitlementGrace(state({ status: "grace" }))).toBe(true)
    expect(isEntitlementGrace(state({ status: "active" }))).toBe(false)
    expect(isEntitlementGrace(state({ status: "suspended" }))).toBe(false)
  })
})

describe("la décision d'ensemble", () => {
  it("ne lève rien sur un serveur en bonne santé", () => {
    expect(detectAlerts(state(), NOW)).toEqual([])
  })

  it("lève chaque genre indépendamment", () => {
    const kinds = detectAlerts(
      state({
        status: "grace",
        lastHeartbeatAt: minutesAgo(90),
        disk: 97,
        agentVersion: "1.0.0",
        publishedVersions: ["1.1.0", "1.2.0"],
      }),
      NOW
    )

    expect(kinds.sort()).toEqual([
      "agent_outdated",
      "disk_high",
      "entitlement_grace",
      "server_unreachable",
    ])
  })
})
