import { describe, expect, it } from "bun:test"
import {
  buildReferences,
  normalizeSubject,
  referencedMessageIds,
  replySubject,
  SNIPPET_LENGTH,
  snippetOf,
  stripAngles,
} from "./normalize"

describe("normalizeSubject", () => {
  it("retire les préfixes de réponse et de transfert empilés", () => {
    expect(normalizeSubject("Re: Fwd: RE : Mon serveur ne répond plus")).toBe(
      "mon serveur ne répond plus"
    )
  })

  it("retire aussi TR: et Fw:", () => {
    expect(normalizeSubject("TR: Fw: Facture")).toBe("facture")
  })

  it("retire un compteur entre crochets", () => {
    expect(normalizeSubject("Re[2]: Facture")).toBe("facture")
  })

  it("écrase les espaces et passe en minuscules", () => {
    expect(normalizeSubject("  Deux   Mots  ")).toBe("deux mots")
  })

  it("rend une chaîne vide pour un sujet qui n'est qu'un préfixe", () => {
    expect(normalizeSubject("Re:")).toBe("")
  })
})

describe("replySubject", () => {
  it("préfixe une seule fois", () => {
    expect(replySubject("Re: Facture")).toBe("Re: Facture")
    expect(replySubject("Facture")).toBe("Re: Facture")
  })
})

describe("snippetOf", () => {
  it("coupe à 160 caractères", () => {
    expect(snippetOf("a".repeat(400))).toHaveLength(SNIPPET_LENGTH)
  })

  it("écrase les retours à la ligne", () => {
    expect(snippetOf("Bonjour\n\n  Jordan")).toBe("Bonjour Jordan")
  })

  it("rend null sans texte", () => {
    expect(snippetOf("   ")).toBeNull()
    expect(snippetOf(null)).toBeNull()
  })
})

describe("referencedMessageIds", () => {
  it("lit les identifiants entre chevrons, sans doublon", () => {
    expect(referencedMessageIds("<a@x> <b@x>", "<b@x>")).toEqual(["a@x", "b@x"])
  })

  it("accepte un en-tête sans chevrons", () => {
    expect(referencedMessageIds("a@x")).toEqual(["a@x"])
  })

  it("ignore les en-têtes absents", () => {
    expect(referencedMessageIds(null, undefined)).toEqual([])
  })
})

describe("buildReferences", () => {
  it("ajoute l'identifiant du message répondu à la chaîne existante", () => {
    expect(buildReferences("<a@x>", "b@x")).toBe("<a@x> <b@x>")
  })

  it("ne duplique pas un identifiant déjà présent", () => {
    expect(buildReferences("<a@x> <b@x>", "b@x")).toBe("<a@x> <b@x>")
  })

  it("rend null quand rien n'est référencé", () => {
    expect(buildReferences(null, null)).toBeNull()
  })
})

describe("stripAngles", () => {
  it("retire les chevrons d'un Message-ID", () => {
    expect(stripAngles(" <abc@pupitre.studio> ")).toBe("abc@pupitre.studio")
  })
})
