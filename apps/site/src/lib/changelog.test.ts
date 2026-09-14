import { describe, expect, it } from "vitest"
import { byVersionDesc } from "./changelog"

describe("byVersionDesc", () => {
  it("orders releases by version, newest first, whatever their dates", () => {
    const sorted = byVersionDesc(
      [
        { version: "0.1.1" },
        { version: "0.1.2" },
        { version: "0.1.0" },
        { version: "0.10.0" },
      ],
      (entry) => entry.version
    )

    expect(sorted.map((entry) => entry.version)).toEqual([
      "0.10.0",
      "0.1.2",
      "0.1.1",
      "0.1.0",
    ])
  })
})
