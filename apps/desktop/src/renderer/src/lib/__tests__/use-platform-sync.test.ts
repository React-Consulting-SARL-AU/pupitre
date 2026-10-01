import { describe, expect, it } from "bun:test";
import type { AccountState } from "@shared/account";
import type { AccountView } from "../../stores/account";
import { syncKey } from "../use-platform-sync";

function view(email: string | null): AccountView {
  const account: AccountState = {
    build: "development",
    checkedAt: null,
    consoleUrl: "http://localhost:3000",
    device: null,
    identity: email
      ? {
          email,
          license: "valid",
          licenseGrant: null,
          name: "Ada",
          organization: null,
          organizations: [],
          role: null,
          servers: { limit: 3, used: 1 },
        }
      : null,
    refusal: null,
    sealed: false,
    usage: {
      license: "valid",
      source: "platform",
      status: "granted",
      validUntil: null,
    },
  };

  return { account, status: "read" };
}

describe("syncKey", () => {
  it("is the same value for two answers carrying the same account", () => {
    expect(syncKey(view("ada@test.local"))).toBe(
      syncKey(view("ada@test.local"))
    );
  });

  it("changes when the account does", () => {
    expect(syncKey(view("ada@test.local"))).not.toBe(
      syncKey(view("grace@test.local"))
    );
  });

  it("is null while nobody is signed in", () => {
    expect(syncKey(view(null))).toBeNull();
    expect(syncKey({ status: "unknown" })).toBeNull();
  });
});
