import { describe, expect, it } from "bun:test";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sealer } from "../account-vault";
import { createConnectionVault } from "../connection-vault";

/** The ciphertext must not carry the plaintext, or the assertion below proves nothing. */
const SEALED: Sealer = {
  available: () => true,
  decrypt: (value) => Buffer.from(value.toString("utf8"), "base64").toString(),
  encrypt: (value) => Buffer.from(Buffer.from(value).toString("base64")),
};

const OPEN: Sealer = {
  available: () => false,
  decrypt: () => {
    throw new Error("no keychain");
  },
  encrypt: () => {
    throw new Error("no keychain");
  },
};

function vault(sealer: Sealer = SEALED) {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-connections-"));

  return { dir, vault: createConnectionVault({ dir, sealer }) };
}

describe("le coffre des connexions", () => {
  it("garde un jeton par fournisseur, chiffré, et le compte à côté", () => {
    const { dir, vault: held } = vault();

    held.connect("github", "ghp_de_test", { id: "42", name: "ada" });
    held.connect("neon", "neon_de_test", { id: "u-1", name: "ada@test" });

    expect(held.token("github")).toBe("ghp_de_test");
    expect(held.token("neon")).toBe("neon_de_test");
    expect(held.account("github")).toEqual({ id: "42", name: "ada" });

    expect(readFileSync(join(dir, "github.token"), "utf8")).not.toContain(
      "ghp_de_test"
    );
    expect(readFileSync(join(dir, "github.json"), "utf8")).not.toContain(
      "ghp_de_test"
    );
  });

  it("oublie un fournisseur sans toucher aux autres", () => {
    const { vault: held } = vault();

    held.connect("github", "ghp_de_test", { id: "42", name: "ada" });
    held.connect("cloudflare", "cf_de_test", { id: "acc", name: "Atelier" });

    held.clear("github");

    expect(held.holds("github")).toBe(false);
    expect(held.token("github")).toBeNull();
    expect(held.token("cloudflare")).toBe("cf_de_test");
  });

  // A service account token answers no call from the laptop, so no provider can name its account.
  it("tient un jeton que personne ne sait nommer", () => {
    const { vault: held } = vault();

    held.connect("1password", "ops_de_test", null);

    expect(held.holds("1password")).toBe(true);
    expect(held.account("1password")).toBeNull();
    expect(held.token("1password")).toBe("ops_de_test");
  });

  it("se souvient du compte quand l'ordinateur n'a pas de trousseau", () => {
    const { vault: held } = vault(OPEN);

    held.connect("github", "ghp_de_test", { id: "42", name: "ada" });

    expect(held.sealed()).toBe(false);
    expect(held.holds("github")).toBe(true);
    expect(held.account("github")).toEqual({ id: "42", name: "ada" });
  });

  it("garde à côté du jeton ce qui n'est pas un secret : l'adresse d'un seau", () => {
    const { dir, vault: held } = vault();

    held.connect(
      "backup",
      "s3-secret",
      { id: "pupitre-backups", name: "pupitre-backups" },
      { bucket: "pupitre-backups", endpoint: "https://acme.example" }
    );

    expect(held.settings("backup")).toEqual({
      bucket: "pupitre-backups",
      endpoint: "https://acme.example",
    });
    expect(held.settings("github")).toBeNull();
    expect(readFileSync(join(dir, "backup.json"), "utf8")).not.toContain(
      "s3-secret"
    );
  });

  // Before a second connection existed, Cloudflare stored the account as `accountId`/`accountName`.
  it("relit le compte Cloudflare écrit par une version précédente", () => {
    const { dir, vault: held } = vault();

    writeFileSync(
      join(dir, "cloudflare.json"),
      JSON.stringify({
        connection: { accountId: "acc-1", accountName: "Atelier Ada" },
      })
    );

    expect(held.holds("cloudflare")).toBe(true);
    expect(held.account("cloudflare")).toEqual({
      id: "acc-1",
      name: "Atelier Ada",
    });
    expect(
      JSON.parse(readFileSync(join(dir, "cloudflare.json"), "utf8"))
    ).toEqual({
      connection: { id: "acc-1", name: "Atelier Ada" },
      version: 1,
    });
    expect(existsSync(join(dir, "cloudflare.json.r0"))).toBe(true);
  });

  it("écrit chaque fiche avec sa révision, en 0600", () => {
    const { dir, vault: held } = vault();

    held.connect("github", "ghp_de_test", { id: "42", name: "ada" });

    const path = join(dir, "github.json");

    expect(JSON.parse(readFileSync(path, "utf8")).version).toBe(1);
    expect(statSync(path).mode & 0o777).toBe(0o600);
  });
});
