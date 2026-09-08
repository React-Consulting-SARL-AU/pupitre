import { describe, expect, it } from "bun:test"
import { documentTitle, serverDocumentTitle } from "@/lib/domain/page-titles"

describe("documentTitle", () => {
  it("names the page then the product, in the locale of the match", () => {
    expect(documentTitle("/dashboard/servers", "fr")).toBe("Serveurs · Pupitre")
    expect(documentTitle("/dashboard/servers", "en")).toBe("Servers · Pupitre")
  })
})

describe("serverDocumentTitle", () => {
  it("takes the server's own name once the loader has answered", () => {
    expect(serverDocumentTitle("vps-e2e", "fr")).toBe("vps-e2e · Pupitre")
  })

  it("falls back to the generic name while the name is unknown", () => {
    expect(serverDocumentTitle(undefined, "fr")).toBe("Serveur · Pupitre")
    expect(serverDocumentTitle(null, "en")).toBe("Server · Pupitre")
  })
})
