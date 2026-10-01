import { describe, expect, it } from "bun:test";
import type { Manifest } from "@pupitre/shared/catalog";
import { accountValues, type HeldConnection } from "../account-values";

const HELD: Record<string, HeldConnection> = {
  "1password": { account: null, token: "ops_de_test" },
  cloudflare: {
    account: { id: "407880e9a2f71d528020f4201d604548", name: "Flyleaf" },
    token: "cf_de_test",
  },
  github: {
    account: { id: "70213307", name: "flyleaf" },
    token: "ghp_de_test",
  },
  neon: { account: { id: "u_1", name: "flyleaf" }, token: "neon_de_test" },
  wrangler: {
    account: { id: "407880e9a2f71d528020f4201d604548", name: "Flyleaf" },
    token: "cf_wrangler_de_test",
  },
};

const token = (kind: string) => HELD[kind] ?? null;

function manifest(
  id: string,
  connection: string | undefined,
  fields: Manifest["fields"]
): Manifest {
  return {
    arch: ["amd64"],
    category: "tool",
    conflicts: [],
    connection: connection as Manifest["connection"],
    fields,
    id,
    mandatory: false,
    name: id,
    requires: [],
    resources: { disk_mb: 0, ram_mb: 0 },
    runs: false,
    since: "0.1.0",
    summary: id,
  };
}

const MANAGED = {
  key: "token",
  kind: "secret",
  label: "Token",
  managed: true,
  required: true,
} as const;

const CATALOG: Manifest[] = [
  manifest("tool.github", "github", [MANAGED]),
  manifest("tool.neon", "neon", [{ ...MANAGED, key: "api_key", label: "Key" }]),
  manifest("tool.wrangler", "wrangler", [
    { ...MANAGED, key: "api_token", label: "Token" },
    {
      key: "account_id",
      kind: "text",
      label: "Account",
      managed: true,
      required: true,
    },
  ]),
  manifest("runtime.node", undefined, [
    {
      default: "22",
      key: "node_version",
      kind: "version",
      label: "Node",
      options: ["22", "20"],
    },
  ]),
  // Typed rather than managed: an older agent still asks for it in the form.
  manifest("tool.1password", undefined, [
    {
      key: "service_account_token",
      kind: "secret",
      label: "Token",
      required: true,
    },
  ]),
];

describe("an installation's account values", () => {
  it("carries only the modules whose manifest declares a connection", () => {
    const answer = accountValues(
      ["runtime.node", "tool.github", "tool.neon"],
      CATALOG,
      token
    );

    expect(answer.ok && answer.result).toEqual({
      config: {},
      secrets: {
        "tool.github": { token: "ghp_de_test" },
        "tool.neon": { api_key: "neon_de_test" },
      },
    });
  });

  it("fills a managed text field with the identifier of the account the token opens", () => {
    const answer = accountValues(["tool.wrangler"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({
      config: {
        "tool.wrangler": { account_id: "407880e9a2f71d528020f4201d604548" },
      },
      secrets: { "tool.wrangler": { api_token: "cf_wrangler_de_test" } },
    });
  });

  it("leaves a managed text field empty when the account has no name", () => {
    const unnamed = [
      manifest("tool.wrangler", "wrangler", [
        {
          key: "account_id",
          kind: "text",
          label: "Account",
          managed: true,
          required: true,
        },
      ]),
    ];

    const answer = accountValues(["tool.wrangler"], unnamed, () => ({
      account: null,
      token: "cf_wrangler_de_test",
    }));

    expect(answer.ok && answer.result).toEqual({ config: {}, secrets: {} });
  });

  it("leaves a typed field to the form, even on a module an account could serve", () => {
    const answer = accountValues(["tool.1password"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({ config: {}, secrets: {} });
  });

  it("carries nothing when no chosen module declares one", () => {
    const answer = accountValues(["runtime.node"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({ config: {}, secrets: {} });
  });

  // Refusing here leaves the machine untouched; refusing on it leaves half an install.
  it("refuses before the first step when the account is not connected", () => {
    const answer = accountValues(["tool.github"], CATALOG, () => null);

    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error.phrase).toEqual({
      id: "refusal.connection.absent",
      values: { kind: "github" },
    });
  });

  it("leaves to the tunnel the values the tunnel derives", () => {
    const withTunnel = [
      ...CATALOG,
      manifest("exposure.cloudflare", "cloudflare", [
        { ...MANAGED, key: "tunnel_secret", label: "Secret" },
      ]),
    ];

    const answer = accountValues(
      ["exposure.cloudflare"],
      withTunnel,
      () => null,
      ["exposure.cloudflare"]
    );

    expect(answer.ok && answer.result).toEqual({ config: {}, secrets: {} });
  });
});
