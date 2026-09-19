import { describe, expect, it } from "bun:test"
import { listSearch, nextListSearch } from "@/lib/domain/list-search"

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
