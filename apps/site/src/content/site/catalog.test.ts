import {
  MANDATORY_MODULE_IDS,
  MODULE_CATEGORIES,
  MODULE_IDS,
  MVP_MODULE_IDS,
} from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import { LOCALES } from "../../lib/i18n"
import { AVAILABILITY_LABELS, CATALOG, CATALOG_ENTRIES } from "./catalog"

describe("catalog content", () => {
  it("lists every module of the shared contract exactly once", () => {
    const ids = CATALOG_ENTRIES.map((entry) => entry.id)

    expect([...ids].sort()).toEqual([...MODULE_IDS].sort())
    expect(new Set(ids).size).toBe(ids.length)
  })

  it("has one group per shared category, in the contract order", () => {
    expect(CATALOG.map((group) => group.id)).toEqual([...MODULE_CATEGORIES])
    for (const group of CATALOG) {
      expect(group.entries.length).toBeGreaterThan(0)
    }
  })

  it("marks MVP modules as mvp and the others as later", () => {
    for (const entry of CATALOG_ENTRIES) {
      const expected = (MVP_MODULE_IDS as readonly string[]).includes(entry.id)
        ? "mvp"
        : "later"

      expect(entry.availability, entry.id).toBe(expected)
    }
  })

  it("flags the mandatory core group and no other", () => {
    const core = CATALOG.find((group) => group.id === "core")

    expect(core?.note).toBeDefined()
    expect(core?.entries.map((entry) => entry.id)).toEqual([
      ...MANDATORY_MODULE_IDS,
    ])
    for (const group of CATALOG.filter(
      (candidate) => candidate.id !== "core"
    )) {
      expect(group.note).toBeUndefined()
    }
  })

  it("names groups, entries and availability in both languages", () => {
    for (const locale of LOCALES) {
      expect(AVAILABILITY_LABELS.mvp[locale].trim()).not.toBe("")
      expect(AVAILABILITY_LABELS.later[locale].trim()).not.toBe("")
      for (const group of CATALOG) {
        expect(group.label[locale].trim(), group.id).not.toBe("")
        for (const entry of group.entries) {
          expect(entry.name[locale].trim(), entry.id).not.toBe("")
          expect(entry.detail[locale].trim(), entry.id).not.toBe("")
        }
      }
    }
  })
})
