import { afterEach, describe, expect, it } from "bun:test";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ACCOUNT_MIGRATIONS } from "../account-migrations";
import { createTokenVault, EMPTY_RECORD, type Sealer } from "../account-vault";
import { expectedRevision } from "../store-migrations";

/**
 * The token never lands readable.
 *
 * The fake sealer stands in for `safeStorage`: it is reversible, like the
 * keychain, and that is precisely why the assertions look at the bytes on disk
 * rather than at what the vault gives back.
 */

const TOKEN = "pupitre-session-9f2c4a7e-do-not-write-me-down";

const MASK = 0x5a;

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-vault-"));

  dirs.push(dir);

  return dir;
}

const keychain: Sealer = {
  available: () => true,
  decrypt: (value) => Buffer.from(value.map((byte) => byte ^ MASK)).toString(),
  encrypt: (value) =>
    Buffer.from([...Buffer.from(value)].map((byte) => byte ^ MASK)),
};

const refusing: Sealer = {
  available: () => false,
  decrypt: () => {
    throw new Error("no keychain");
  },
  encrypt: () => {
    throw new Error("no keychain");
  },
};

function everyFile(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);

    return entry.isDirectory() ? everyFile(full) : [full];
  });
}

function carriesToken(dir: string): string[] {
  return everyFile(dir).filter((file) => {
    const bytes = readFileSync(file);

    return (
      bytes.toString("utf8").includes(TOKEN) ||
      bytes.toString("latin1").includes(TOKEN) ||
      bytes.toString("base64").includes(Buffer.from(TOKEN).toString("base64"))
    );
  });
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("le coffre du jeton", () => {
  it("n'écrit le jeton en clair dans aucun fichier", () => {
    const dir = scratch();
    const vault = createTokenVault({ dir, sealer: keychain });

    vault.keep(TOKEN);
    vault.remember({
      checkedAt: new Date().toISOString(),
      device: {
        fingerprint: "SHA256:abc",
        id: "dev-1",
        name: "MacBook",
        publicKey: "ssh-ed25519 AAAA",
      },
      identity: {
        email: "ada@pupitre.studio",
        entitlement: "valid",
        name: "Ada",
        organization: { id: "org-1", name: "Ada", slug: "ada" },
        organizations: [
          { id: "org-1", name: "Ada", role: "owner", slug: "ada" },
        ],
        role: "owner",
        subscription: null,
      },
    });

    expect(everyFile(dir).length).toBe(2);
    expect(carriesToken(dir)).toEqual([]);
  });

  it("rend le jeton à qui a la clé du trousseau", () => {
    const dir = scratch();

    createTokenVault({ dir, sealer: keychain }).keep(TOKEN);

    expect(createTokenVault({ dir, sealer: keychain }).token()).toBe(TOKEN);
  });

  it("écrit le chiffré en 0600", () => {
    const dir = scratch();

    createTokenVault({ dir, sealer: keychain }).keep(TOKEN);

    for (const file of everyFile(dir)) {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("ne pose rien sur le disque quand le trousseau se refuse", () => {
    const dir = scratch();
    const vault = createTokenVault({ dir, sealer: refusing });

    vault.keep(TOKEN);

    expect(vault.sealed()).toBe(false);
    expect(vault.token()).toBe(TOKEN);
    expect(everyFile(dir)).toEqual([]);
    expect(createTokenVault({ dir, sealer: refusing }).token()).toBeNull();
  });

  it("estampille la fiche de sa révision", () => {
    const dir = scratch();

    createTokenVault({ dir, sealer: keychain }).remember(EMPTY_RECORD);

    expect(
      JSON.parse(readFileSync(join(dir, "account.json"), "utf8")).version
    ).toBe(expectedRevision(ACCOUNT_MIGRATIONS));
  });

  it("met de côté une fiche illisible au lieu de l'écraser", () => {
    const dir = scratch();
    const path = join(dir, "account.json");
    writeFileSync(path, "{ tronqué");

    const vault = createTokenVault({ dir, sealer: keychain });

    expect(vault.record()).toEqual(EMPTY_RECORD);
    expect(readFileSync(`${path}.corrupt`, "utf8")).toBe("{ tronqué");
    expect(statSync(`${path}.corrupt`).mode & 0o777).toBe(0o600);
  });

  it("ne réécrit pas la fiche d'une version plus récente, et tient la nouvelle pour la session", () => {
    const dir = scratch();
    const path = join(dir, "account.json");
    const newer = JSON.stringify({ ...EMPTY_RECORD, later: 1, version: 99 });
    writeFileSync(path, newer);

    const vault = createTokenVault({ dir, sealer: keychain });
    const fresh = { ...EMPTY_RECORD, checkedAt: "2026-09-25T10:00:00Z" };

    vault.record();
    vault.remember(fresh);

    expect(readFileSync(path, "utf8")).toBe(newer);
    expect(vault.record()).toEqual(fresh);
  });

  it("emporte le jeton et la fiche à la déconnexion", () => {
    const dir = scratch();
    const vault = createTokenVault({ dir, sealer: keychain });

    vault.keep(TOKEN);
    vault.remember({ checkedAt: null, device: null, identity: null });
    vault.clear();

    expect(everyFile(dir)).toEqual([]);
    expect(vault.token()).toBeNull();
  });
});
