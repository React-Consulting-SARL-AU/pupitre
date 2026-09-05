import { describe, expect, it } from "vitest"
import {
  type DocsEntry,
  docPath,
  docSlug,
  flatten,
  groupSections,
  moduleIdFromSlug,
  moduleSlug,
  neighbours,
  sectionOf,
  tableOfContents,
} from "./docs"

const entry = (over: Partial<DocsEntry>): DocsEntry => ({
  slug: "start/vps",
  section: "start",
  sectionOrder: 0,
  order: 1,
  title: "Choose a VPS",
  description: "What the machine needs.",
  ...over,
})

describe("slugs", () => {
  it("drops the locale folder from a collection id", () => {
    expect(docSlug("en/start/vps")).toBe("start/vps")
    expect(docSlug("fr/account/faq")).toBe("account/faq")
  })

  it("puts English at the root and French under /fr", () => {
    expect(docPath("start/vps", "en")).toBe("/docs/start/vps/")
    expect(docPath("start/vps", "fr")).toBe("/fr/docs/start/vps/")
    expect(docPath("", "fr")).toBe("/fr/docs/")
  })

  it("turns a module id into a path segment and back", () => {
    expect(moduleSlug("db.postgres")).toBe("services/db-postgres")
    expect(moduleIdFromSlug("services/db-postgres", ["db.postgres"])).toBe(
      "db.postgres"
    )
  })

  it("falls back to the first section for an unknown one", () => {
    expect(sectionOf("daily")).toBe("daily")
    expect(sectionOf("nowhere")).toBe("start")
  })
})

describe("groupSections", () => {
  it("orders sections as declared and entries by their order", () => {
    const sections = groupSections(
      [
        entry({ slug: "account/faq", section: "account", order: 4 }),
        entry({ slug: "start/keys", order: 2, title: "Your key" }),
        entry({ slug: "start/vps", order: 1 }),
      ],
      "en"
    )

    expect(sections.map((section) => section.id)).toEqual(["start", "account"])
    expect(sections[0].entries.map((item) => item.slug)).toEqual([
      "start/vps",
      "start/keys",
    ])
  })

  it("drops a section with nothing in it", () => {
    const sections = groupSections([entry({})], "en")

    expect(sections).toHaveLength(1)
  })
})

describe("neighbours", () => {
  const ordered = flatten(
    groupSections(
      [
        entry({ slug: "start/vps", order: 1 }),
        entry({ slug: "start/keys", order: 2, title: "Your key" }),
        entry({
          slug: "account/faq",
          section: "account",
          order: 1,
          title: "Questions",
        }),
      ],
      "en"
    )
  )

  it("walks the whole documentation in reading order", () => {
    expect(neighbours(ordered, "start/keys")).toEqual({
      previous: ordered[0],
      next: ordered[2],
    })
  })

  it("has no previous at the start and no next at the end", () => {
    expect(neighbours(ordered, "start/vps").previous).toBeUndefined()
    expect(neighbours(ordered, "account/faq").next).toBeUndefined()
    expect(neighbours(ordered, "nowhere")).toEqual({})
  })
})

describe("tableOfContents", () => {
  it("keeps the two depths a reader can scan", () => {
    const headings = [
      { depth: 1, slug: "title", text: "Title" },
      { depth: 2, slug: "one", text: "One" },
      { depth: 3, slug: "two", text: "Two" },
      { depth: 4, slug: "three", text: "Three" },
    ]

    expect(tableOfContents(headings).map((item) => item.slug)).toEqual([
      "one",
      "two",
    ])
  })
})
