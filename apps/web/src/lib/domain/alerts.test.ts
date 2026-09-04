import { describe, expect, it } from "bun:test"
import { ALERT_KINDS, alertBannerLabel, alertLook, countAlerts } from "./alerts"

describe("alertLook", () => {
  it("donne une forme, un ton, un libellé et un remède à chaque genre", () => {
    for (const kind of ALERT_KINDS) {
      const look = alertLook(kind)

      expect(look.label.length).toBeGreaterThan(0)
      expect(look.fix.length).toBeGreaterThan(0)
      expect(["barred", "hollow"]).toContain(look.shape)
    }
  })

  it("distingue les genres par la forme avant la couleur", () => {
    expect(alertLook("server_unreachable").shape).toBe("barred")
    expect(alertLook("agent_outdated").shape).toBe("hollow")
  })

  it("retombe sur un libellé neutre pour un genre inconnu", () => {
    expect(alertLook("météorite").label.length).toBeGreaterThan(0)
  })
})

describe("le bandeau de la liste", () => {
  it("ne compte que les serveurs qui portent une alerte", () => {
    expect(
      countAlerts([
        { alerts: [{ kind: "disk_high" }, { kind: "agent_outdated" }] },
        { alerts: [] },
        { alerts: [{ kind: "server_unreachable" }] },
      ])
    ).toEqual({ alerts: 3, servers: 2 })
  })

  it("accorde son libellé", () => {
    expect(alertBannerLabel({ alerts: 1, servers: 1 })).toBe(
      "1 alerte active sur 1 serveur"
    )
    expect(alertBannerLabel({ alerts: 3, servers: 2 })).toBe(
      "3 alertes actives sur 2 serveurs"
    )
  })
})
