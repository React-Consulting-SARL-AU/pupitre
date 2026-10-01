import { describe, expect, it } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Server } from "@shared/servers";
import {
  copyIdCommand,
  generateKey,
  importKey,
  KeyError,
  keyPaths,
  readPublicKey,
  removeKey,
} from "../keys";

function keysDir(): string {
  return join(mkdtempSync(join(tmpdir(), "pupitre-keys-")), "keys");
}

const SERVER: Server = {
  host: "203.0.113.10",
  id: "srv-a",
  name: "Staging",
  origin: "app",
  port: 2222,
  user: "root",
};

describe("a generated key", () => {
  it("is an ed25519 without a passphrase, in the app's data folder", async () => {
    const dir = keysDir();

    const pair = await generateKey(dir, "srv-a");

    expect(dirname(pair.keyPath)).toBe(dir);
    expect(pair.publicKey.startsWith("ssh-ed25519 ")).toBe(true);
    expect(readFileSync(pair.keyPath, "utf8")).toContain("OPENSSH PRIVATE KEY");
  });

  it("is 0600 in a 0700 folder", async () => {
    const dir = keysDir();

    const pair = await generateKey(dir, "srv-a");

    expect(statSync(pair.keyPath).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(pair.publicKeyPath).mode & 0o777).toBe(0o644);
  });

  it("only leaves the app folder through its public half", async () => {
    const dir = keysDir();

    await generateKey(dir, "srv-a");

    const published = readPublicKey(dir, "srv-a");

    expect(published).toContain("ssh-ed25519 ");
    expect(published).not.toContain("PRIVATE KEY");
  });

  it("refuses an identifier that would escape the folder", async () => {
    const dir = keysDir();

    expect(generateKey(dir, "../../evil")).rejects.toBeInstanceOf(KeyError);
  });

  it("disappears with the server", async () => {
    const dir = keysDir();
    const pair = await generateKey(dir, "srv-a");

    removeKey(dir, "srv-a");

    expect(readPublicKey(dir, "srv-a")).toBe(null);
    expect(() => statSync(pair.keyPath)).toThrow();
  });
});

describe("an imported key", () => {
  it("is copied into the app folder, never referenced in place", async () => {
    const dir = keysDir();
    const source = join(mkdtempSync(join(tmpdir(), "pupitre-src-")), "id");
    const generated = await generateKey(keysDir(), "elsewhere");

    writeFileSync(source, readFileSync(generated.keyPath, "utf8"), {
      mode: 0o600,
    });

    const pair = await importKey(dir, "srv-a", source);

    expect(pair.keyPath).toBe(keyPaths(dir, "srv-a").keyPath);
    expect(dirname(pair.keyPath)).toBe(dir);
    expect(statSync(pair.keyPath).mode & 0o777).toBe(0o600);
    expect(pair.publicKey).toBe(
      generated.publicKey.split(" ").slice(0, 2).join(" ")
    );
  });

  it("says what is missing when the file is not there", async () => {
    const dir = keysDir();

    expect(importKey(dir, "srv-a", "/nowhere/id_ed25519")).rejects.toThrow(
      /refusal.key.missing/
    );
  });

  it("refuses what is not a private key, and says what to choose", async () => {
    const dir = keysDir();
    const source = join(mkdtempSync(join(tmpdir(), "pupitre-src-")), "id.pub");

    writeFileSync(source, "ssh-ed25519 AAAAC3Nz nobody@nowhere\n");

    expect(importKey(dir, "srv-a", source)).rejects.toThrow(
      /refusal.key.public/
    );
  });
});

describe("the ssh-copy-id command", () => {
  it("carries the public key, the port and the server's user", () => {
    const command = copyIdCommand(SERVER, "/data/keys/srv-a.pub");

    expect(command).toBe(
      "ssh-copy-id -i /data/keys/srv-a.pub -p 2222 root@203.0.113.10"
    );
  });

  it("omits the default port", () => {
    expect(copyIdCommand({ ...SERVER, port: 22 }, "/k.pub")).toBe(
      "ssh-copy-id -i /k.pub root@203.0.113.10"
    );
  });

  it("protects a path with spaces, like the app's on macOS", () => {
    const command = copyIdCommand(
      SERVER,
      "/Users/moi/Library/Application Support/@pupitre/desktop/keys/srv-a.pub"
    );

    expect(command).toBe(
      "ssh-copy-id -i '/Users/moi/Library/Application Support/@pupitre/desktop/keys/srv-a.pub' -p 2222 root@203.0.113.10"
    );
  });

  it("closes, escapes and reopens an apostrophe in the path", () => {
    expect(copyIdCommand({ ...SERVER, port: 22 }, "/k'a.pub")).toBe(
      "ssh-copy-id -i '/k'\\''a.pub' root@203.0.113.10"
    );
  });
});
