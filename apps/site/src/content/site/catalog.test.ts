import {
  MANDATORY_MODULE_IDS,
  MODULE_CATEGORIES,
  MODULE_IDS,
} from "@pupitre/shared/catalog"
import { describe, expect, it } from "vitest"
import { LOCALES } from "../../lib/i18n"
import { CATALOG, CATALOG_ENTRIES, isRequired } from "./catalog"

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

  it("marks the mandatory modules as required, and them alone", () => {
    const required = CATALOG_ENTRIES.filter((entry) => isRequired(entry.id))

    expect(required.map((entry) => entry.id)).toEqual([...MANDATORY_MODULE_IDS])
  })

  it("names groups and entries in both languages", () => {
    for (const locale of LOCALES) {
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
