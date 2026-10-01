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

describe("the status page rows", () => {
  it("says whether a service responds, and treats an unknown state as an outage", () => {
    expect(healthLook("ok").label).toBe("service.responds")
    expect(healthLook("down").label).toBe("service.doesNotRespond")
    expect(healthLook("brouillé").tone).toBe("danger")
  })

  it("says a version is published, not that it responds", () => {
    expect(releaseLook(true).label).toBe("statusPage.releasePublished")
    expect(releaseLook(false).label).toBe("statusPage.noRelease")
    expect(releaseLook(false).tone).toBe("muted")
  })
})

describe("freshnessNotice", () => {
  it("says nothing when the observation is fresh", () => {
    expect(
      freshnessNotice(
        "fresh",
        new Date(NOW.getTime() - 60_000).toISOString(),
        t,
        NOW
      )
    ).toBeNull()
  })

  it("says since when the platform has had no news", () => {
    const notice = freshnessNotice("stale", STALE_AT.toISOString(), t, NOW)

    expect(notice?.headline).toBe("Dernière observation il y a 1 h")
    expect(notice?.detail).toContain("15 minutes")
    expect(notice?.look.tone).toBe("warn")
  })

  it("tells the absence of an observation from a reassuring state", () => {
    const notice = freshnessNotice("unknown", null, t, NOW)

    expect(notice?.headline).toBe("Aucune observation à afficher")
    expect(notice?.look.tone).toBe("muted")
  })
})

describe("observationLabel", () => {
  it("dates the observation when there is one", () => {
    expect(observationLabel("stale", STALE_AT.toISOString(), t, NOW)).toBe(
      "Dernière observation il y a 1 h."
    )
  })

  it("admits the absence of an observation", () => {
    expect(observationLabel("unknown", null, t, NOW)).toBe(
      "Aucune observation reçue."
    )
  })
})

describe("the active server counter", () => {
  it("presents itself as is when the observation is fresh", () => {
    expect(activeServersLabel("fresh", t)).toBe("Serveurs actifs")
    expect(activeServersValue("fresh", 12, t)).toBe("12")
  })

  it("dates itself when the observation is stale", () => {
    expect(activeServersLabel("stale", t)).toBe(
      "Serveurs actifs à la dernière observation"
    )
    expect(activeServersValue("stale", 12, t)).toBe("12")
  })

  it("shows no figure without an observation", () => {
    expect(activeServersValue("unknown", 12, t)).toBe("—")
  })
})
