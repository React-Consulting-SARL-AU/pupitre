import { describe, expect, it } from "bun:test";
import { accountStateOf } from "../account-state";

describe("a module's account state", () => {
  it("is the CLI's when the agent answered", () => {
    expect(
      accountStateOf(
        { state: "signed_out" },
        { status: "connected", account: null, sealed: false }
      )
    ).toBe("signed_out");
  });

  it("is that of the account the computer holds for a module that declares one", () => {
    expect(
      accountStateOf(undefined, {
        status: "connected",
        account: null,
        sealed: false,
      })
    ).toBe("signed_in");
    expect(accountStateOf(undefined, { status: "absent" })).toBe("signed_out");
  });

  it("does not exist for a module without an account or connection", () => {
    expect(accountStateOf(undefined, null)).toBeNull();
  });
});
