import { describe, expect, it } from "bun:test";
import { ACCOUNT_SECRETS, accountSecrets } from "../account-secrets";

/**
 * How an account token reaches the machine once it no longer comes from a form.
 *
 * It travels exactly as it did: grouped by module identifier on the install's
 * own secret line, written by the main process, never in `params` and never
 * through the window. The only change is where it was taken from.
 */

const HELD: Record<string, string> = {
  "1password": "ops_de_test",
  github: "ghp_de_test",
  neon: "neon_de_test",
};

const token = (kind: string) => HELD[kind] ?? null;

describe("les secrets de compte d'une installation", () => {
  it("ne porte que les modules de la sélection, sous leur propre clé", () => {
    const answer = accountSecrets(
      ["core.system", "tool.github", "tool.neon"],
      token
    );

    expect(answer.ok && answer.result).toEqual({
      "tool.github": { token: "ghp_de_test" },
      "tool.neon": { api_key: "neon_de_test" },
    });
  });

  it("ne porte rien quand aucun module n'a de compte", () => {
    const answer = accountSecrets(["core.system", "runtime.node"], token);

    expect(answer.ok && answer.result).toEqual({});
  });

  /** Refusing here leaves the machine untouched; refusing on it leaves half an install. */
  it("refuse avant la première étape quand le compte n'est pas connecté", () => {
    const answer = accountSecrets(["tool.github"], () => null);

    expect(answer.ok).toBe(false);
    expect(!answer.ok && answer.error.phrase).toEqual({
      id: "refusal.connection.absent",
      values: { kind: "github" },
    });
  });

  it("nomme le champ que chaque manifeste déclare managed", () => {
    expect(
      ACCOUNT_SECRETS.map(({ module, field }) => `${module}.${field}`)
    ).toEqual([
      "tool.github.token",
      "tool.1password.service_account_token",
      "tool.neon.api_key",
    ]);
  });
});
