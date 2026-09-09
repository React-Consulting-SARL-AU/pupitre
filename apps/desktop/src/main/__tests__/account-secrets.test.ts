import { describe, expect, it } from "bun:test";
import type { Manifest } from "@pupitre/shared/catalog";
import { accountSecrets } from "../account-secrets";

/**
 * How an account token reaches the machine once it no longer comes from a form.
 *
 * It travels exactly as it did: grouped by module identifier on the install's
 * own secret line, written by the main process, never in `params` and never
 * through the window. Two things are watched beyond that — the app reads which
 * module wants one from the manifests the agent declared rather than from a
 * list of its own, and it refuses before the first step rather than on the
 * machine.
 */

const HELD: Record<string, string> = {
  "1password": "ops_de_test",
  github: "ghp_de_test",
  neon: "neon_de_test",
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
  manifest("runtime.node", undefined, [
    {
      default: "22",
      key: "node_version",
      kind: "version",
      label: "Node",
      options: ["22", "20"],
    },
  ]),
  // Typed rather than managed: an older agent still wants it in the form, and
  // the app has no business filling it.
  manifest("tool.1password", undefined, [
    {
      key: "service_account_token",
      kind: "secret",
      label: "Token",
      required: true,
    },
  ]),
];

describe("les secrets de compte d'une installation", () => {
  it("ne porte que les modules dont le manifeste déclare une connexion", () => {
    const answer = accountSecrets(
      ["runtime.node", "tool.github", "tool.neon"],
      CATALOG,
      token
    );

    expect(answer.ok && answer.result).toEqual({
      "tool.github": { token: "ghp_de_test" },
      "tool.neon": { api_key: "neon_de_test" },
    });
  });

  /** The catalogue belongs to the agent: an older one keeps asking in the form. */
  it("laisse un champ typé au formulaire, même sur un module qu'un compte pourrait servir", () => {
    const answer = accountSecrets(["tool.1password"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({});
  });

  it("ne porte rien quand aucun module choisi n'en déclare", () => {
    const answer = accountSecrets(["runtime.node"], CATALOG, token);

    expect(answer.ok && answer.result).toEqual({});
  });

  /** Refusing here leaves the machine untouched; refusing on it leaves half an install. */
  it("refuse avant la première étape quand le compte n'est pas connecté", () => {
    const answer = accountSecrets(["tool.github"], CATALOG, () => null);

    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error.phrase).toEqual({
      id: "refusal.connection.absent",
      values: { kind: "github" },
    });
  });

  /** The tunnel's own managed secret is made by the tunnel code, not taken from a vault. */
  it("laisse au tunnel les valeurs que le tunnel dérive", () => {
    const withTunnel = [
      ...CATALOG,
      manifest("exposure.cloudflare", "cloudflare", [
        { ...MANAGED, key: "tunnel_secret", label: "Secret" },
      ]),
    ];

    const answer = accountSecrets(
      ["exposure.cloudflare"],
      withTunnel,
      () => null,
      ["exposure.cloudflare"]
    );

    expect(answer.ok && answer.result).toEqual({});
  });
});
