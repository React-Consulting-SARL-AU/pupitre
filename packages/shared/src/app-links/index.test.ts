import { describe, expect, it } from "bun:test"
import { APP_LINK_SCHEME, accountCallbackLink } from "./index"

describe("the links that open the app", () => {
  it("send the reader back to the account, with what the platform says", () => {
    expect(APP_LINK_SCHEME).toBe("pupitre")
    expect(accountCallbackLink()).toBe("pupitre://account/callback")
    expect(accountCallbackLink({ device: "approved" })).toBe(
      "pupitre://account/callback?device=approved"
    )
  })
})
