import { describe, expect, it } from "bun:test"
import { MAIL_MAX_REFERENCES } from "@pupitre/shared/legal"
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
  it("strips stacked reply and forward prefixes", () => {
    expect(normalizeSubject("Re: Fwd: RE : Mon serveur ne répond plus")).toBe(
      "mon serveur ne répond plus"
    )
  })

  it("also strips TR: and Fw:", () => {
    expect(normalizeSubject("TR: Fw: Facture")).toBe("facture")
  })

  it("strips a counter in square brackets", () => {
    expect(normalizeSubject("Re[2]: Facture")).toBe("facture")
  })

  it("collapses whitespace and lowercases", () => {
    expect(normalizeSubject("  Deux   Mots  ")).toBe("deux mots")
  })

  it("returns an empty string for a subject that is only a prefix", () => {
    expect(normalizeSubject("Re:")).toBe("")
  })
})

describe("replySubject", () => {
  it("prefixes only once", () => {
    expect(replySubject("Re: Facture")).toBe("Re: Facture")
    expect(replySubject("Facture")).toBe("Re: Facture")
  })
})

describe("snippetOf", () => {
  it("truncates at 160 characters", () => {
    expect(snippetOf("a".repeat(400))).toHaveLength(SNIPPET_LENGTH)
  })

  it("collapses line breaks", () => {
    expect(snippetOf("Bonjour\n\n  Jordan")).toBe("Bonjour Jordan")
  })

  it("returns null without text", () => {
    expect(snippetOf("   ")).toBeNull()
    expect(snippetOf(null)).toBeNull()
  })
})

describe("referencedMessageIds", () => {
  it("reads the identifiers between angle brackets, without duplicates", () => {
    expect(referencedMessageIds("<a@x> <b@x>", "<b@x>")).toEqual(["a@x", "b@x"])
  })

  it("accepts a header without angle brackets", () => {
    expect(referencedMessageIds("a@x")).toEqual(["a@x"])
  })

  it("keeps only the most recent of an oversized chain", () => {
    const chain = Array.from({ length: 5000 }, (_, index) => `<m${index}@x>`)
    const ids = referencedMessageIds(chain.join(" "))

    expect(ids).toHaveLength(MAIL_MAX_REFERENCES)
    expect(ids.at(-1)).toBe("m4999@x")
    expect(ids[0]).toBe(`m${5000 - MAIL_MAX_REFERENCES}@x`)
  })

  it("keeps In-Reply-To read after a full chain", () => {
    const chain = Array.from({ length: 50 }, (_, index) => `<m${index}@x>`)

    expect(referencedMessageIds(chain.join(" "), "<repondu@x>")).toContain(
      "repondu@x"
    )
  })

  it("ignores missing headers", () => {
    expect(referencedMessageIds(null, undefined)).toEqual([])
  })
})

describe("buildReferences", () => {
  it("appends the replied-to message's identifier to the existing chain", () => {
    expect(buildReferences("<a@x>", "b@x")).toBe("<a@x> <b@x>")
  })

  it("bounds the returned chain, the replied-to identifier last", () => {
    const chain = Array.from({ length: 40 }, (_, index) => `<m${index}@x>`)
    const references = buildReferences(chain.join(" "), "repondu@x") ?? ""

    expect(references.split(" ")).toHaveLength(MAIL_MAX_REFERENCES)
    expect(references.endsWith("<repondu@x>")).toBe(true)
  })

  it("does not duplicate an identifier already present", () => {
    expect(buildReferences("<a@x> <b@x>", "b@x")).toBe("<a@x> <b@x>")
  })

  it("returns null when nothing is referenced", () => {
    expect(buildReferences(null, null)).toBeNull()
  })
})

describe("stripAngles", () => {
  it("strips the angle brackets of a Message-ID", () => {
    expect(stripAngles(" <abc@pupitre.studio> ")).toBe("abc@pupitre.studio")
  })
})
