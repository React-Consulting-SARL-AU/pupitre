import { describe, expect, it } from "bun:test";
import { accountStateOf } from "../account-state";

describe("l'état du compte d'un module", () => {
  it("est celui du CLI quand l'agent a répondu", () => {
    expect(
      accountStateOf(
        { state: "signed_out" },
        { status: "connected", account: null, sealed: false }
      )
    ).toBe("signed_out");
  });

  it("est celui du compte que l'ordinateur tient pour un module qui en déclare un", () => {
    expect(
      accountStateOf(undefined, {
        status: "connected",
        account: null,
        sealed: false,
      })
    ).toBe("signed_in");
    expect(accountStateOf(undefined, { status: "absent" })).toBe("signed_out");
  });

  it("n'existe pas pour un module sans compte ni connexion", () => {
    expect(accountStateOf(undefined, null)).toBeNull();
  });
});
