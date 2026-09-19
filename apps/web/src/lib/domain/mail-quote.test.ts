import { describe, expect, it } from "bun:test"
import { splitQuotedBody } from "@/lib/domain/mail-quote"

describe("splitQuotedBody", () => {
  it("leaves a message without history whole", () => {
    const { visible, quoted } = splitQuotedBody("Bonjour,\n\nÇa marche.")

    expect(visible).toBe("Bonjour,\n\nÇa marche.")
    expect(quoted).toBeNull()
  })

  it("folds a French attribution and everything under it", () => {
    const { visible, quoted } = splitQuotedBody(
      [
        "On regarde.",
        "",
        "Le 3 mars 2026 à 10:12, Ada Lovelace a écrit :",
        "> Mon serveur ne répond plus",
      ].join("\n")
    )

    expect(visible).toBe("On regarde.")
    expect(quoted).toContain("Le 3 mars 2026")
    expect(quoted).toContain("> Mon serveur ne répond plus")
  })

  it("folds an English attribution", () => {
    const { visible, quoted } = splitQuotedBody(
      [
        "We are looking.",
        "",
        "On Mar 3, 2026, Ada wrote:",
        "> It is down",
      ].join("\n")
    )

    expect(visible).toBe("We are looking.")
    expect(quoted).toContain("On Mar 3, 2026")
  })

  it("folds a bare quote block with no attribution", () => {
    const { visible, quoted } = splitQuotedBody("Merci.\n> Bonjour")

    expect(visible).toBe("Merci.")
    expect(quoted).toBe("> Bonjour")
  })

  it("folds a signature opened by a double dash", () => {
    const { visible, quoted } = splitQuotedBody(
      "Bonne journée.\n\n-- \nJordan\nPupitre"
    )

    expect(visible).toBe("Bonne journée.")
    expect(quoted).toBe("-- \nJordan\nPupitre")
  })

  it("keeps nothing visible when the message opens on a quote", () => {
    const { visible, quoted } = splitQuotedBody("> Bonjour\n> Ça va ?")

    expect(visible).toBe("")
    expect(quoted).toBe("> Bonjour\n> Ça va ?")
  })
})
