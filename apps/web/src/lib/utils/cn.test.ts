import { describe, expect, it } from "bun:test"
import { cn } from "./cn"

describe("cn", () => {
  it("keeps the label style when a caller adds a text colour", () => {
    expect(cn("text-label", "text-ink-2")).toBe("text-label text-ink-2")
  })

  it("still lets a later class win within its own group", () => {
    expect(cn("px-2 text-ink-3", "px-4 text-ink")).toBe("px-4 text-ink")
  })
})
