import { describe, expect, it } from "bun:test"
import { ALERT_KINDS } from "@pupitre/shared/platform-api"
import { translator } from "@/lib/i18n/i18n"
import { alertLook, countAlerts } from "./alerts"

describe("alertLook", () => {
  it("donne une forme, un ton, un libellé et un remède à chaque genre", () => {
    const t = translator("fr")

    for (const kind of ALERT_KINDS) {
      const look = alertLook(kind)

      expect(t(look.label).length).toBeGreaterThan(0)
      expect(t(look.fix).length).toBeGreaterThan(0)
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

  it("accorde la phrase du bandeau dans les deux langues", () => {
    const fr = translator("fr")
    const en = translator("en")
    const banner = (t: typeof fr, alerts: number, servers: number) =>
      t.plural("alert.banner", alerts, {
        alerts,
        servers: t.plural("alert.banner.servers", servers),
      })

    expect(banner(fr, 1, 1)).toBe("1 alerte active sur 1 serveur")
    expect(banner(fr, 3, 2)).toBe("3 alertes actives sur 2 serveurs")
    expect(banner(en, 1, 1)).toBe("1 active alert on 1 server")
    expect(banner(en, 3, 2)).toBe("3 active alerts on 2 servers")
  })
})
