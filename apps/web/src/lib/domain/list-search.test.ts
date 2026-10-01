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
  it("keeps what the reader chose", () => {
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

  it("omits default values", () => {
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

  it("ignores a sort, a direction, a filter and an offset the page does not know", () => {
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

  it("reads no sort when the page declares none", () => {
    expect(listSearch()({ sort: "name" })).toEqual({})
  })

  it("reads a flag the router already made boolean the same as one spelled out", () => {
    expect(parse({ unread: true })).toEqual({ unread: true })
    expect(parse({ unread: "false" })).toEqual({ unread: false })
  })
})

describe("listSort", () => {
  const sorts = ["created_at", "name"] as const

  it("keeps a declared sort and otherwise falls back to the page's", () => {
    expect(listSort("name", sorts, "created_at")).toBe("name")
    expect(listSort("couleur", sorts, "created_at")).toBe("created_at")
    expect(listSort(undefined, sorts, "created_at")).toBe("created_at")
  })
})

describe("flagValue and readFlag", () => {
  it("round-trip between the flag and what the select carries", () => {
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

  it("keeps the offset when only the page turns", () => {
    expect(nextListSearch(previous, { offset: 100 })).toEqual({
      q: "ada",
      offset: 100,
    })
  })

  it("returns to the first page as soon as a filter or the search changes", () => {
    expect(nextListSearch(previous, { q: "leo" })).toEqual({ q: "leo" })
  })

  it("turns a second list's page without sending the first back to the start", () => {
    const two: { offset?: number; app_offset?: number } = { offset: 50 }

    expect(nextListSearch(two, { app_offset: 25 })).toEqual({
      offset: 50,
      app_offset: 25,
    })
  })
})

describe("a named offset", () => {
  const pages = listSearch({ filters: { app_offset: { kind: "offset" } } })

  it("carries a second list's page, and leaves it at the first", () => {
    expect(pages({ app_offset: "25" })).toEqual({ app_offset: 25 })
    expect(pages({ app_offset: 0 })).toEqual({})
    expect(pages({ app_offset: -3 })).toEqual({})
  })
})
