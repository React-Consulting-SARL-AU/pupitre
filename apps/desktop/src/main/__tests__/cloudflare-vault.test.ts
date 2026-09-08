import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Sealer } from "../account-vault";
import { createCloudflareVault } from "../cloudflare-vault";

/**
 * The account read back from the disk, whatever the disk holds.
 *
 * A fiche written by an older shape of the app is still a readable JSON object:
 * the vault has to weigh it rather than believe it, because everything above
 * takes a connected account for one that carries a name.
 */

const TOKEN = "cloudflare-token-do-not-write-me-down";

const MASK = 0x5a;

const dirs: string[] = [];

function scratch(): string {
  const dir = mkdtempSync(join(tmpdir(), "pupitre-cloudflare-"));

  dirs.push(dir);

  return dir;
}

const keychain: Sealer = {
  available: () => true,
  decrypt: (value) => Buffer.from(value.map((byte) => byte ^ MASK)).toString(),
  encrypt: (value) =>
    Buffer.from([...Buffer.from(value)].map((byte) => byte ^ MASK)),
};

function withRecord(record: unknown): string {
  const dir = scratch();

  writeFileSync(join(dir, "cloudflare.json"), JSON.stringify(record));

  return dir;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) {
    rmSync(dir, { force: true, recursive: true });
  }
});

describe("le coffre Cloudflare", () => {
  it("rend le compte qu'on lui a confié", () => {
    const dir = scratch();
    const connection = { accountId: "acc-1", accountName: "Ada" };

    createCloudflareVault({ dir, sealer: keychain }).connect(TOKEN, connection);

    expect(
      createCloudflareVault({ dir, sealer: keychain }).connection()
    ).toEqual(connection);
  });

  it("ignore une fiche d'une forme antérieure", () => {
    const dir = withRecord({
      connection: {
        accountId: "acc-1",
        domain: "pupitre.sh",
        zoneId: "zone-1",
        zoneName: "pupitre.sh",
      },
      tunnels: { "srv-1": { id: "tun-1", secret: "s" } },
    });

    expect(
      createCloudflareVault({ dir, sealer: keychain }).connection()
    ).toBeNull();
  });

  it("ignore une fiche sans compte", () => {
    const dir = withRecord({ connection: { accountName: "Ada" } });

    expect(
      createCloudflareVault({ dir, sealer: keychain }).connection()
    ).toBeNull();
  });

  it("ignore une fiche illisible", () => {
    const dir = scratch();

    writeFileSync(join(dir, "cloudflare.json"), "{");

    expect(
      createCloudflareVault({ dir, sealer: keychain }).connection()
    ).toBeNull();
  });
});
