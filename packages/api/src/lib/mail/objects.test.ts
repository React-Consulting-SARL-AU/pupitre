import { describe, expect, it } from "bun:test"
import { rewriteInlineImages, servedAttachmentType } from "./objects"

const URLS = new Map([
  [
    "logo@exemple.fr",
    "https://acc.r2.cloudflarestorage.com/ppt-mail/a?x=1&y=2",
  ],
])

describe("rewriteInlineImages", () => {
  it("replaces a known cid, in double quotes, single quotes or bare, escaping the address", () => {
    const html =
      "<img src=\"cid:logo@exemple.fr\"><img src='cid:logo@exemple.fr'><img src=cid:logo@exemple.fr>"

    expect(rewriteInlineImages(html, URLS)).toBe(
      '<img src="https://acc.r2.cloudflarestorage.com/ppt-mail/a?x=1&amp;y=2">'.repeat(
        3
      )
    )
  })

  it("leaves an unknown cid and a regular src as they are", () => {
    const html =
      '<img src="cid:absent@exemple.fr"><img src="https://exemple.fr/a.png">'

    expect(rewriteInlineImages(html, URLS)).toBe(html)
  })

  it("ignores the case of the attribute", () => {
    expect(
      rewriteInlineImages('<IMG SRC="cid:logo@exemple.fr">', URLS)
    ).toContain('SRC="https://')
  })
})

describe("servedAttachmentType", () => {
  it("keeps a type from the list and reduces the rest to bytes", () => {
    expect(servedAttachmentType("Application/PDF; name=x")).toBe(
      "application/pdf"
    )
    expect(servedAttachmentType("image/svg+xml")).toBe(
      "application/octet-stream"
    )
    expect(servedAttachmentType("text/html")).toBe("application/octet-stream")
  })
})
