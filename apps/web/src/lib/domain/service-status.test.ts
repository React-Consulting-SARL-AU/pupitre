import { describe, expect, it } from "bun:test"
import { STATUS_STALE_AFTER_MS } from "@pupitre/shared/status"
import {
  activeServersLabel,
  activeServersValue,
  freshnessNotice,
  healthLook,
  observationLabel,
  releaseLook,
} from "@/lib/domain/service-status"
import { translator } from "@/lib/i18n/i18n"

const t = translator("fr")

const NOW = new Date("2026-09-04T12:00:00.000Z")

const STALE_AT = new Date(NOW.getTime() - STATUS_STALE_AFTER_MS - 3_600_000)

describe("les lignes de la page d'état", () => {
  it("dit d'un service qu'il répond ou non, et tient un état inconnu pour une panne", () => {
    expect(healthLook("ok").label).toBe("service.responds")
    expect(healthLook("down").label).toBe("service.doesNotRespond")
    expect(healthLook("brouillé").tone).toBe("danger")
  })

  it("dit d'une version qu'elle est publiée, pas qu'elle répond", () => {
    expect(releaseLook(true).label).toBe("statusPage.releasePublished")
    expect(releaseLook(false).label).toBe("statusPage.noRelease")
    expect(releaseLook(false).tone).toBe("muted")
  })
})

describe("freshnessNotice", () => {
  it("ne dit rien quand l'observation est fraîche", () => {
    expect(
      freshnessNotice(
        "fresh",
        new Date(NOW.getTime() - 60_000).toISOString(),
        t,
        NOW
      )
    ).toBeNull()
  })

  it("dit depuis quand la plateforme n'a plus de nouvelles", () => {
    const notice = freshnessNotice("stale", STALE_AT.toISOString(), t, NOW)

    expect(notice?.headline).toBe("Dernière observation il y a 1 h")
    expect(notice?.detail).toContain("15 minutes")
    expect(notice?.look.tone).toBe("warn")
  })

  it("distingue l'absence d'observation d'un état rassurant", () => {
    const notice = freshnessNotice("unknown", null, t, NOW)

    expect(notice?.headline).toBe("Aucune observation à afficher")
    expect(notice?.look.tone).toBe("muted")
  })
})

describe("observationLabel", () => {
  it("date l'observation quand elle existe", () => {
    expect(observationLabel("stale", STALE_AT.toISOString(), t, NOW)).toBe(
      "Dernière observation il y a 1 h."
    )
  })

  it("avoue l'absence d'observation", () => {
    expect(observationLabel("unknown", null, t, NOW)).toBe(
      "Aucune observation reçue."
    )
  })
})

describe("le compteur de serveurs actifs", () => {
  it("se présente tel quel quand l'observation est fraîche", () => {
    expect(activeServersLabel("fresh", t)).toBe("Serveurs actifs")
    expect(activeServersValue("fresh", 12, t)).toBe("12")
  })

  it("se date quand l'observation est périmée", () => {
    expect(activeServersLabel("stale", t)).toBe(
      "Serveurs actifs à la dernière observation"
    )
    expect(activeServersValue("stale", 12, t)).toBe("12")
  })

  it("ne montre aucun chiffre sans observation", () => {
    expect(activeServersValue("unknown", 12, t)).toBe("—")
  })
})
