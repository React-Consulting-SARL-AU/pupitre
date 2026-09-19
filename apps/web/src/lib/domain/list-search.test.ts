import { describe, expect, it } from "bun:test"
import {
  FILTER_ALL,
  flagValue,
  listSearch,
  listSort,
  nextListSearch,
  readFlag,
} from "@/lib/domain/list-search"

const parse = listSearch({
  sortKeys: ["created_at", "name"],
  defaultSort: "created_at",
  defaultDirection: "desc",
  filters: {
    status: { kind: "enum", values: ["active", "suspended"] },
    unread: { kind: "boolean" },
    organization_id: { kind: "string" },
  },
})

describe("listSearch", () => {
  it("garde ce que le lecteur a choisi", () => {
    expect(
      parse({
        q: " ada ",
        offset: "50",
        sort: "name",
        direction: "asc",
        status: "suspended",
        unread: "true",
        organization_id: "org_1",
      })
    ).toEqual({
      q: "ada",
      offset: 50,
      sort: "name",
      direction: "asc",
      status: "suspended",
      unread: true,
      organization_id: "org_1",
    })
  })

  it("omet les valeurs par défaut", () => {
    expect(
      parse({
        q: "",
        offset: 0,
        sort: "created_at",
        direction: "desc",
        status: "",
      })
    ).toEqual({})
  })

  it("ignore un tri, un sens, un filtre et un décalage que la page ne connaît pas", () => {
    expect(
      parse({
        sort: "couleur",
        direction: "sideways",
        status: "inconnu",
        unread: "peut-être",
        offset: -5,
      })
    ).toEqual({})
  })

  it("ne lit aucun tri quand la page n'en déclare pas", () => {
    expect(listSearch()({ sort: "name" })).toEqual({})
  })

  it("lit un drapeau que le routeur a déjà rendu booléen comme celui écrit en toutes lettres", () => {
    expect(parse({ unread: true })).toEqual({ unread: true })
    expect(parse({ unread: "false" })).toEqual({ unread: false })
  })
})

describe("listSort", () => {
  const sorts = ["created_at", "name"] as const

  it("garde un tri déclaré et retombe sur celui de la page sinon", () => {
    expect(listSort("name", sorts, "created_at")).toBe("name")
    expect(listSort("couleur", sorts, "created_at")).toBe("created_at")
    expect(listSort(undefined, sorts, "created_at")).toBe("created_at")
  })
})

describe("flagValue et readFlag", () => {
  it("font l'aller-retour entre le drapeau et ce que le select porte", () => {
    expect(flagValue(undefined)).toBe(FILTER_ALL)
    expect(flagValue(true)).toBe("true")
    expect(flagValue(false)).toBe("false")
    expect(readFlag(FILTER_ALL)).toBeUndefined()
    expect(readFlag("true")).toBe(true)
    expect(readFlag("false")).toBe(false)
  })
})

describe("nextListSearch", () => {
  const previous: { q?: string; offset?: number } = { q: "ada", offset: 50 }

  it("garde le décalage quand seule la page tourne", () => {
    expect(nextListSearch(previous, { offset: 100 })).toEqual({
      q: "ada",
      offset: 100,
    })
  })

  it("revient à la première page dès qu'un filtre ou la recherche change", () => {
    expect(nextListSearch(previous, { q: "leo" })).toEqual({ q: "leo" })
  })
})
