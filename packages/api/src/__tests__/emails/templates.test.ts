import { describe, expect, it } from "bun:test"
import { LOCALES } from "@pupitre/shared/i18n"
import { EMAIL_PREVIEWS, previewOf, SAMPLE } from "../../emails/catalog"
import { renderAlertBackupFailedEmail } from "../../emails/render"
import { EMAIL_TEMPLATE_IDS } from "../../emails/templates/ids"

function href(url: string): string {
  return `href="${url.replace(/&/g, "&amp;")}"`
}

const UNRESOLVED_PLACEHOLDER_RE =
  /\{(server|organization|inviter|device|deadline|url|count|version|current|disk|address|fingerprint|date|paid|seated|reason)\}/
const RGB_WITH_ALPHA_RE = /rgb\([^)]*\//

describe("the template catalogue", () => {
  it("carries one preview per template", () => {
    expect(EMAIL_PREVIEWS.map((preview) => preview.id).sort()).toEqual(
      [...EMAIL_TEMPLATE_IDS].sort()
    )
  })

  it("counts the fifteen moments and the six alerts", () => {
    expect(EMAIL_TEMPLATE_IDS).toHaveLength(21)
    expect(EMAIL_TEMPLATE_IDS.filter((id) => id.startsWith("alert_"))).toEqual([
      "alert_server_unreachable",
      "alert_disk_high",
      "alert_agent_outdated",
      "alert_license_grace",
      "alert_backup_failed",
      "alert_backup_stale",
    ])
  })
})

describe("the rendering of each template", () => {
  for (const preview of EMAIL_PREVIEWS) {
    for (const locale of LOCALES) {
      it(`${preview.id} renders in ${locale}`, async () => {
        const email = await preview.render(locale)

        expect(email.subject.length).toBeGreaterThan(0)
        expect(email.html).toContain("<html")
        expect(email.html).toContain("&gt;_")
        expect(email.text.length).toBeGreaterThan(0)
        expect(email.html).not.toMatch(UNRESOLVED_PLACEHOLDER_RE)
        expect(email.text).not.toMatch(UNRESOLVED_PLACEHOLDER_RE)
        expect(email.text).toContain("pupitre.studio")
      })
    }
  }
})

describe("data flows into the rendering", () => {
  it("the magic link carries the received link, and only that", async () => {
    const email = await previewOf("magic_link").render("fr")

    expect(email.html).toContain(href(SAMPLE.magicLinkUrl))
    expect(email.text).toContain(SAMPLE.magicLinkUrl)
  })

  it("the invitation carries the organization, the host and its link", async () => {
    const email = await previewOf("invitation").render("fr")

    expect(email.subject).toContain(SAMPLE.organizationName)
    expect(email.html).toContain(href(SAMPLE.invitationUrl))
    expect(email.html).toContain(SAMPLE.inviterEmail)
  })

  it("the enrolled server carries its address, version and fingerprint", async () => {
    const email = await previewOf("server_enrolled").render("fr")

    expect(email.html).toContain(SAMPLE.address)
    expect(email.html).toContain(SAMPLE.agentVersion)
    expect(email.html).toContain(SAMPLE.hostFingerprint)
    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard`))
  })

  it("the assigned server names the server and the organization", async () => {
    const email = await previewOf("server_assigned").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.html).toContain(SAMPLE.organizationName)
    expect(email.html).toContain(SAMPLE.address)
  })

  it("the added device carries its name and fingerprint", async () => {
    const email = await previewOf("device_added").render("fr")

    expect(email.html).toContain(SAMPLE.deviceName)
    expect(email.html).toContain(SAMPLE.deviceFingerprint)
    expect(email.html).toContain(
      href(`${SAMPLE.consoleUrl}/dashboard/settings`)
    )
  })

  it("the grace carries its deadline and the billing link", async () => {
    const email = await previewOf("license_grace").render("fr")

    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard/billing`))
    expect(email.html).toContain("2026")
  })

  it("the suspension states the fix", async () => {
    const email = await previewOf("server_suspended").render("fr")

    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard/billing`))
    expect(email.text.length).toBeGreaterThan(80)
  })

  it("the suspension by the team carries the reason and the support address", async () => {
    const email = await previewOf("server_suspended_admin").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.html).toContain(SAMPLE.suspensionReason)
    expect(email.html).toContain("mailto:support@pupitre.studio")
  })

  it("the seat gap states both numbers and leads to billing", async () => {
    const email = await previewOf("seats_drift").render("fr")

    expect(email.text).toContain(String(SAMPLE.paidSeats))
    expect(email.text).toContain(String(SAMPLE.serverCount))
    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard/billing`))
  })

  it("the decommissioning announces the erasure date", async () => {
    const email = await previewOf("server_decommission").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.html).toContain("2026")
  })

  it("the backup failure carries the error as the agent stated it", async () => {
    const email = await previewOf("alert_backup_failed").render("en")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.text).toContain(SAMPLE.backupError)
  })

  it("an incomplete backup says how many parts are missing, rather than an empty error", async () => {
    const email = await renderAlertBackupFailedEmail({
      locale: "fr",
      serverName: SAMPLE.serverName,
      lastError: null,
      missing: 2,
      lastRunAt: SAMPLE.lastBackupRunAt,
    })

    expect(email.subject).toContain("incomplète")
    expect(email.text).toContain("Parties manquantes")
    expect(email.text).not.toContain("Dernière erreur")
  })

  it("the overdue backup states the interval and the last success", async () => {
    const email = await previewOf("alert_backup_stale").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.text).toContain(`${SAMPLE.backupIntervalHours} h`)
    expect(email.text).toContain("2 septembre 2026")
  })
})

describe("the monochrome theme", () => {
  it("is always light: no dark block, nothing Gmail cannot read", async () => {
    const email = await previewOf("magic_link").render("fr")

    expect(email.html).toContain("#ffffff")
    expect(email.html).toContain("#0a0a0a")
    expect(email.html).not.toContain("prefers-color-scheme")
    expect(email.html).not.toContain("box-shadow")
    expect(email.html).not.toMatch(RGB_WITH_ALPHA_RE)
  })
})
