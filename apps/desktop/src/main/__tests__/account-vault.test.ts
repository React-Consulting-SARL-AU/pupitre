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

// The fake sealer is reversible like the keychain, so assertions read the bytes on disk, not the vault.

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

describe("the token vault", () => {
  it("writes the token in plaintext to no file", () => {
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
        license: "valid",
        licenseGrant: null,
        name: "Ada",
        organization: { id: "org-1", name: "Ada", slug: "ada" },
        organizations: [
          { id: "org-1", name: "Ada", role: "owner", slug: "ada" },
        ],
        role: "owner",
        servers: { limit: 3, used: 1 },
      },
    });

    expect(everyFile(dir).length).toBe(2);
    expect(carriesToken(dir)).toEqual([]);
  });

  it("returns the token to whoever has the keychain key", () => {
    const dir = scratch();

    createTokenVault({ dir, sealer: keychain }).keep(TOKEN);

    expect(createTokenVault({ dir, sealer: keychain }).token()).toBe(TOKEN);
  });

  it("writes the ciphertext with mode 0600", () => {
    const dir = scratch();

    createTokenVault({ dir, sealer: keychain }).keep(TOKEN);

    for (const file of everyFile(dir)) {
      expect(statSync(file).mode & 0o777).toBe(0o600);
    }
  });

  it("writes nothing to disk when the keychain refuses", () => {
    const dir = scratch();
    const vault = createTokenVault({ dir, sealer: refusing });

    vault.keep(TOKEN);

    expect(vault.sealed()).toBe(false);
    expect(vault.token()).toBe(TOKEN);
    expect(everyFile(dir)).toEqual([]);
    expect(createTokenVault({ dir, sealer: refusing }).token()).toBeNull();
  });

  it("stamps the record with its revision", () => {
    const dir = scratch();

    createTokenVault({ dir, sealer: keychain }).remember(EMPTY_RECORD);

    expect(
      JSON.parse(readFileSync(join(dir, "account.json"), "utf8")).version
    ).toBe(expectedRevision(ACCOUNT_MIGRATIONS));
  });

  it("sets aside an unreadable record instead of overwriting it", () => {
    const dir = scratch();
    const path = join(dir, "account.json");
    writeFileSync(path, "{ tronqué");

    const vault = createTokenVault({ dir, sealer: keychain });

    expect(vault.record()).toEqual(EMPTY_RECORD);
    expect(readFileSync(`${path}.corrupt`, "utf8")).toBe("{ tronqué");
    expect(statSync(`${path}.corrupt`).mode & 0o777).toBe(0o600);
  });

  it("does not rewrite a newer version's record, and holds the new one for the session", () => {
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

  it("removes the token and the record on disconnect", () => {
    const dir = scratch();
    const vault = createTokenVault({ dir, sealer: keychain });

    vault.keep(TOKEN);
    vault.remember({ checkedAt: null, device: null, identity: null });
    vault.clear();

    expect(everyFile(dir)).toEqual([]);
    expect(vault.token()).toBeNull();
  });
});
