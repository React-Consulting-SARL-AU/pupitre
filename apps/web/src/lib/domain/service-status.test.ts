import { describe, expect, it } from "bun:test"
import { STATUS_STALE_AFTER_MS } from "@pupitre/shared/status"
import {
  activeServersLabel,
  activeServersValue,
  freshnessNotice,
  observationLabel,
} from "@/lib/domain/service-status"

const NOW = new Date("2026-09-04T12:00:00.000Z")

const STALE_AT = new Date(NOW.getTime() - STATUS_STALE_AFTER_MS - 3_600_000)

describe("freshnessNotice", () => {
  it("ne dit rien quand l'observation est fraîche", () => {
    expect(
      freshnessNotice(
        "fresh",
        new Date(NOW.getTime() - 60_000).toISOString(),
        NOW
      )
    ).toBeNull()
  })

  it("dit depuis quand la plateforme n'a plus de nouvelles", () => {
    const notice = freshnessNotice("stale", STALE_AT.toISOString(), NOW)

    expect(notice?.headline).toBe("Dernière observation il y a 1 h")
    expect(notice?.detail).toContain("15 minutes")
    expect(notice?.look.tone).toBe("warn")
  })

  it("distingue l'absence d'observation d'un état rassurant", () => {
    const notice = freshnessNotice("unknown", null, NOW)

    expect(notice?.headline).toBe("Aucune observation à afficher")
    expect(notice?.look.tone).toBe("muted")
  })
})

describe("observationLabel", () => {
  it("date l'observation quand elle existe", () => {
    expect(observationLabel("stale", STALE_AT.toISOString(), NOW)).toBe(
      "Dernière observation il y a 1 h."
    )
  })

  it("avoue l'absence d'observation", () => {
    expect(observationLabel("unknown", null, NOW)).toBe(
      "Aucune observation reçue."
    )
  })
})

describe("le compteur de serveurs actifs", () => {
  it("se présente tel quel quand l'observation est fraîche", () => {
    expect(activeServersLabel("fresh")).toBe("Serveurs actifs")
    expect(activeServersValue("fresh", 12)).toBe("12")
  })

  it("se date quand l'observation est périmée", () => {
    expect(activeServersLabel("stale")).toBe(
      "Serveurs actifs à la dernière observation"
    )
    expect(activeServersValue("stale", 12)).toBe("12")
  })

  it("ne montre aucun chiffre sans observation", () => {
    expect(activeServersValue("unknown", 12)).toBe("—")
  })
})
