import { describe, expect, it } from "bun:test"
import { EMAIL_PREVIEWS, previewOf, SAMPLE } from "../../emails/catalog"
import { EMAIL_TEMPLATE_IDS } from "../../emails/templates/ids"
import { LOCALES } from "../../lib/i18n"

function href(url: string): string {
  return `href="${url.replace(/&/g, "&amp;")}"`
}

const UNRESOLVED_PLACEHOLDER_RE =
  /\{(server|organization|inviter|device|deadline|url|count|version|address|fingerprint|date)\}/

describe("le catalogue des gabarits", () => {
  it("porte une prévisualisation par gabarit", () => {
    expect(EMAIL_PREVIEWS.map((preview) => preview.id).sort()).toEqual(
      [...EMAIL_TEMPLATE_IDS].sort()
    )
  })

  it("compte les huit moments de la tâche", () => {
    expect(EMAIL_TEMPLATE_IDS).toHaveLength(8)
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

  it("la décommission annonce la date d'effacement", async () => {
    const email = await previewOf("server_decommission").render("fr")

    expect(email.subject).toContain(SAMPLE.serverName)
    expect(email.html).toContain("2026")
  })
})

describe("le thème monochrome", () => {
  it("n'emprunte que les tokens du thème clair et son bloc sombre", async () => {
    const email = await previewOf("magic_link").render("fr")

    expect(email.html).toContain("#ffffff")
    expect(email.html).toContain("#0a0a0a")
    expect(email.html).toContain("prefers-color-scheme: dark")
  })
})
