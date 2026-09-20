import { describe, expect, it } from "bun:test"
import { LOCALES } from "@pupitre/shared/i18n"
import { EMAIL_PREVIEWS, previewOf, SAMPLE } from "../../emails/catalog"
import { EMAIL_TEMPLATE_IDS } from "../../emails/templates/ids"

function href(url: string): string {
  return `href="${url.replace(/&/g, "&amp;")}"`
}

const UNRESOLVED_PLACEHOLDER_RE =
  /\{(server|organization|inviter|device|deadline|url|count|version|current|disk|address|fingerprint|date|paid|seated|reason)\}/
const RGB_WITH_ALPHA_RE = /rgb\([^)]*\//

describe("le catalogue des gabarits", () => {
  it("porte une prévisualisation par gabarit", () => {
    expect(EMAIL_PREVIEWS.map((preview) => preview.id).sort()).toEqual(
      [...EMAIL_TEMPLATE_IDS].sort()
    )
  })

  it("compte les quinze moments et les quatre alertes", () => {
    expect(EMAIL_TEMPLATE_IDS).toHaveLength(19)
    expect(EMAIL_TEMPLATE_IDS.filter((id) => id.startsWith("alert_"))).toEqual([
      "alert_server_unreachable",
      "alert_disk_high",
      "alert_agent_outdated",
      "alert_entitlement_grace",
    ])
  })
})

describe("le rendu de chaque gabarit", () => {
  for (const preview of EMAIL_PREVIEWS) {
    for (const locale of LOCALES) {
      it(`${preview.id} rend en ${locale}`, async () => {
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

describe("les données passent dans le rendu", () => {
  it("le lien magique porte le lien reçu, et lui seul", async () => {
    const email = await previewOf("magic_link").render("fr")

    expect(email.html).toContain(href(SAMPLE.magicLinkUrl))
    expect(email.text).toContain(SAMPLE.magicLinkUrl)
  })

  it("l'invitation porte l'organisation, l'hôte et son lien", async () => {
    const email = await previewOf("invitation").render("fr")

    expect(email.subject).toContain(SAMPLE.organizationName)
    expect(email.html).toContain(href(SAMPLE.invitationUrl))
    expect(email.html).toContain(SAMPLE.inviterEmail)
  })

  it("le serveur enrôlé porte son adresse, sa version et son empreinte", async () => {
    const email = await previewOf("server_enrolled").render("fr")

    expect(email.html).toContain(SAMPLE.address)
    expect(email.html).toContain(SAMPLE.agentVersion)
    expect(email.html).toContain(SAMPLE.hostFingerprint)
    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard`))
  })

  it("le serveur attribué nomme le serveur et l'organisation", async () => {
    const email = await previewOf("server_assigned").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.html).toContain(SAMPLE.organizationName)
    expect(email.html).toContain(SAMPLE.address)
  })

  it("l'appareil ajouté porte son nom et son empreinte", async () => {
    const email = await previewOf("device_added").render("fr")

    expect(email.html).toContain(SAMPLE.deviceName)
    expect(email.html).toContain(SAMPLE.deviceFingerprint)
    expect(email.html).toContain(
      href(`${SAMPLE.consoleUrl}/dashboard/settings`)
    )
  })

  it("la tolérance porte sa date limite et le lien de facturation", async () => {
    const email = await previewOf("entitlement_grace").render("fr")

    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard/billing`))
    expect(email.html).toContain("2026")
  })

  it("la suspension dit le remède", async () => {
    const email = await previewOf("server_suspended").render("fr")

    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard/billing`))
    expect(email.text.length).toBeGreaterThan(80)
  })

  it("la suspension par l'équipe porte le motif et l'adresse du support", async () => {
    const email = await previewOf("server_suspended_admin").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.html).toContain(SAMPLE.suspensionReason)
    expect(email.html).toContain("mailto:support@pupitre.studio")
  })

  it("l'écart de sièges dit les deux nombres et mène à la facturation", async () => {
    const email = await previewOf("seats_drift").render("fr")

    expect(email.text).toContain(String(SAMPLE.paidSeats))
    expect(email.text).toContain(String(SAMPLE.serverCount))
    expect(email.html).toContain(href(`${SAMPLE.consoleUrl}/dashboard/billing`))
  })

  it("la décommission annonce la date d'effacement", async () => {
    const email = await previewOf("server_decommission").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.html).toContain("2026")
  })
})

describe("le thème monochrome", () => {
  it("est clair, toujours : aucun bloc sombre, rien que Gmail ne sache lire", async () => {
    const email = await previewOf("magic_link").render("fr")

    expect(email.html).toContain("#ffffff")
    expect(email.html).toContain("#0a0a0a")
    expect(email.html).not.toContain("prefers-color-scheme")
    expect(email.html).not.toContain("box-shadow")
    expect(email.html).not.toMatch(RGB_WITH_ALPHA_RE)
  })
})
