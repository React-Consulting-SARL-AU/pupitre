import { describe, expect, it } from "bun:test"
import { ALERT_KINDS } from "@pupitre/shared/platform-api"
import { translator } from "@/lib/i18n/i18n"
import { alertLook, countAlerts } from "./alerts"

describe("alertLook", () => {
  it("gives each kind a shape, a tone, a label and a remedy", () => {
    const t = translator("fr")

    for (const kind of ALERT_KINDS) {
      const look = alertLook(kind)

      expect(t(look.label).length).toBeGreaterThan(0)
      expect(t(look.fix).length).toBeGreaterThan(0)
      expect(["barred", "hollow"]).toContain(look.shape)
    }
  })

  it("tells kinds apart by shape before colour", () => {
    expect(alertLook("server_unreachable").shape).toBe("barred")
    expect(alertLook("agent_outdated").shape).toBe("hollow")
  })

  it("falls back to a neutral label for an unknown kind", () => {
    expect(alertLook("météorite").label.length).toBeGreaterThan(0)
  })
})

describe("the list banner", () => {
  it("counts only the servers that carry an alert", () => {
    expect(
      countAlerts([
        { alerts: [{ kind: "disk_high" }, { kind: "agent_outdated" }] },
        { alerts: [] },
        { alerts: [{ kind: "server_unreachable" }] },
      ])
    ).toEqual({ alerts: 3, servers: 2 })
  })

  it("agrees the banner sentence in both languages", () => {
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
