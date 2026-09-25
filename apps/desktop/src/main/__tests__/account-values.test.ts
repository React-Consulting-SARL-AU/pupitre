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

describe("les valeurs de compte d'une installation", () => {
  it("ne porte que les modules dont le manifeste déclare une connexion", () => {
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

  it("remplit un champ texte géré avec l'identifiant du compte que le jeton ouvre", () => {
    const answer = accountValues(["tool.wrangler"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({
      config: {
        "tool.wrangler": { account_id: "407880e9a2f71d528020f4201d604548" },
      },
      secrets: { "tool.wrangler": { api_token: "cf_wrangler_de_test" } },
    });
  });

  it("laisse vide un champ texte géré quand le compte n'a pas de nom", () => {
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

  it("laisse un champ typé au formulaire, même sur un module qu'un compte pourrait servir", () => {
    const answer = accountValues(["tool.1password"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({ config: {}, secrets: {} });
  });

  it("ne porte rien quand aucun module choisi n'en déclare", () => {
    const answer = accountValues(["runtime.node"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({ config: {}, secrets: {} });
  });

  // Refusing here leaves the machine untouched; refusing on it leaves half an install.
  it("refuse avant la première étape quand le compte n'est pas connecté", () => {
    const answer = accountValues(["tool.github"], CATALOG, () => null);

    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error.phrase).toEqual({
      id: "refusal.connection.absent",
      values: { kind: "github" },
    });
  });

  it("laisse au tunnel les valeurs que le tunnel dérive", () => {
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
