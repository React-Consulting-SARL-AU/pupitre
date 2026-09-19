import { describe, expect, it } from "bun:test"
import { rewriteInlineImages, servedAttachmentType } from "./objects"

const URLS = new Map([
  [
    "logo@exemple.fr",
    "https://acc.r2.cloudflarestorage.com/ppt-mail/a?x=1&y=2",
  ],
])

describe("rewriteInlineImages", () => {
  it("remplace un cid connu, entre guillemets doubles, simples ou nus, en échappant l'adresse", () => {
    const html =
      "<img src=\"cid:logo@exemple.fr\"><img src='cid:logo@exemple.fr'><img src=cid:logo@exemple.fr>"

    expect(rewriteInlineImages(html, URLS)).toBe(
      '<img src="https://acc.r2.cloudflarestorage.com/ppt-mail/a?x=1&amp;y=2">'.repeat(
        3
      )
    )
  })

  it("laisse un cid inconnu et un src ordinaire tels quels", () => {
    const html =
      '<img src="cid:absent@exemple.fr"><img src="https://exemple.fr/a.png">'

    expect(rewriteInlineImages(html, URLS)).toBe(html)
  })

  it("ignore la casse de l'attribut", () => {
    expect(
      rewriteInlineImages('<IMG SRC="cid:logo@exemple.fr">', URLS)
    ).toContain('SRC="https://')
  })
})

describe("servedAttachmentType", () => {
  it("garde un type de la liste et ramène le reste à des octets", () => {
    expect(servedAttachmentType("Application/PDF; name=x")).toBe(
      "application/pdf"
    )
    expect(servedAttachmentType("image/svg+xml")).toBe(
      "application/octet-stream"
    )
    expect(servedAttachmentType("text/html")).toBe("application/octet-stream")
  })
})
