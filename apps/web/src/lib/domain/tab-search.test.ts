import { describe, expect, it } from "bun:test"
import { tabSearch } from "@/lib/domain/tab-search"

const TABS = ["overview", "devices", "danger"] as const

describe("tabSearch", () => {
  const read = tabSearch(TABS)

  it("keeps a tab the page really carries", () => {
    expect(read({ tab: "danger" })).toEqual({ tab: "danger" })
  })

  it("leaves the first tab out of the address", () => {
    expect(read({ tab: "overview" })).toEqual({})
  })

  it("drops a tab nobody wrote and an address without one", () => {
    expect(read({ tab: "ailleurs" })).toEqual({})
    expect(read({})).toEqual({})
  })
})
