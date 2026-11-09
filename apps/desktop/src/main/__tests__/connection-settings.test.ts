import { describe, expect, it } from "bun:test";
import { checkedSettings, heldSettings } from "../connection-settings";

describe("the settings given beside a token", () => {
  it("keeps an Infisical instance and client ID, the address without its trailing slash", () => {
    const checked = checkedSettings("infisical", {
      client_id: " 5c2f1b0e-7a3d-4c1e-9f2a-0b8d6e4c2a1f ",
      domain: "https://infisical.example.org/",
    });

    expect(checked).toEqual({
      ok: true,
      result: {
        client_id: "5c2f1b0e-7a3d-4c1e-9f2a-0b8d6e4c2a1f",
        domain: "https://infisical.example.org",
      },
    });
  });

  it("refuses an instance that is not an address", () => {
    const checked = checkedSettings("infisical", {
      client_id: "client-1",
      domain: "eu.infisical.com",
    });

    expect(!checked.ok && checked.error.phrase?.id).toBe(
      "refusal.connection.infisical.domain"
    );
  });

  it("refuses a client ID that could break out of the server's shell file", () => {
    const checked = checkedSettings("infisical", {
      client_id: "client'; rm -rf ~",
      domain: "https://app.infisical.com",
    });

    expect(!checked.ok && checked.error.phrase?.id).toBe(
      "refusal.connection.infisical.clientId"
    );
  });

  it("takes none for a provider that asks only for a token", () => {
    expect(checkedSettings("github", undefined)).toEqual({
      ok: true,
      result: {},
    });
    expect(checkedSettings("github", { domain: "https://x" }).ok).toBe(false);
  });

  it("reads back only the strings the vault kept", () => {
    expect(heldSettings({ client_id: "client-1", path_style: true })).toEqual({
      client_id: "client-1",
    });
    expect(heldSettings(null)).toEqual({});
  });
});
