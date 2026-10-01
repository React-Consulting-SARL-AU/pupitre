import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sealer } from "../account-vault";
import { createSudoVault } from "../sudo-vault";

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

const PASSWORD = "k7mp-q2xw-9hdt-3vzc-u8fa-6rne";

function vault(sealer: Sealer = SEALED) {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-sudo-"));

  return { dir, vault: createSudoVault({ dir, sealer }) };
}

describe("the sudo password vault", () => {
  it("keeps a server's password in the keychain, never in clear on disk", () => {
    const { dir, vault: held } = vault();

    held.keep("srv-1", PASSWORD);

    expect(held.password("srv-1")).toBe(PASSWORD);
    expect(held.state("srv-1")).toEqual({ held: true, kept: true });

    for (const name of readdirSync(dir)) {
      expect(readFileSync(join(dir, name), "utf8")).not.toContain(PASSWORD);
    }

    expect(createSudoVault({ dir, sealer: SEALED }).password("srv-1")).toBe(
      PASSWORD
    );
  });

  it("without a keychain, keeps it for the session and says so", () => {
    const { dir, vault: held } = vault(OPEN);

    held.keep("srv-1", PASSWORD);

    expect(held.password("srv-1")).toBe(PASSWORD);
    expect(held.state("srv-1")).toEqual({ held: true, kept: false });
    expect(readdirSync(dir)).toEqual([]);
    expect(createSudoVault({ dir, sealer: OPEN }).password("srv-1")).toBe(null);
  });

  it("knows nothing of a server it was not entrusted with, and forgets one that is removed", () => {
    const { dir, vault: held } = vault();

    expect(held.state("srv-2")).toEqual({ held: false, kept: false });

    held.keep("srv-1", PASSWORD);
    held.forget("srv-1");

    expect(held.password("srv-1")).toBe(null);
    expect(existsSync(join(dir, "srv-1.password"))).toBe(false);
  });

  it("refuses an id that would escape its folder", () => {
    const { vault: held } = vault();

    expect(() => held.keep("../account", PASSWORD)).toThrow();
    expect(held.password("../account")).toBe(null);
  });
});
