import { describe, expect, it } from "bun:test"
import {
  AccessCreateParamsSchema,
  AccessUpdateParamsSchema,
  accessKeyId,
} from "./access"

const KEY = `ppk_abcdef012345_${"a1".repeat(16)}`

describe("access keys", () => {
  it("reads the id a key carries", () => {
    expect(accessKeyId(KEY)).toBe("abcdef012345")
  })

  it("refuses what is not a key", () => {
    expect(accessKeyId("Bearer abc")).toBeNull()
    expect(accessKeyId(`${KEY}x`)).toBeNull()
    expect(accessKeyId(KEY.toUpperCase())).toBeNull()
  })

  it("takes a hash and a scope, never the key itself", () => {
    const params = {
      hash: "f".repeat(64),
      id: "abcdef012345",
      name: "iPhone simulator",
      projects: null,
    }

    expect(AccessCreateParamsSchema.safeParse(params).success).toBe(true)
    expect(
      AccessCreateParamsSchema.safeParse({ ...params, key: KEY }).success
    ).toBe(false)
    expect(
      AccessCreateParamsSchema.safeParse({ ...params, projects: [] }).success
    ).toBe(false)
    expect(
      AccessCreateParamsSchema.safeParse({
        ...params,
        projects: ["shop", "shop"],
      }).success
    ).toBe(false)
  })

  it("keeps a name without outer spaces", () => {
    expect(
      AccessUpdateParamsSchema.safeParse({ id: "abcdef012345", name: " x" })
        .success
    ).toBe(false)
  })
})
