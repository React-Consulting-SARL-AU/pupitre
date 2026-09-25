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

describe("une clé générée", () => {
  it("est une ed25519 sans phrase de passe, dans le dossier de données de l'app", async () => {
    const dir = keysDir();

    const pair = await generateKey(dir, "srv-a");

    expect(dirname(pair.keyPath)).toBe(dir);
    expect(pair.publicKey.startsWith("ssh-ed25519 ")).toBe(true);
    expect(readFileSync(pair.keyPath, "utf8")).toContain("OPENSSH PRIVATE KEY");
  });

  it("est en 0600 dans un dossier 0700", async () => {
    const dir = keysDir();

    const pair = await generateKey(dir, "srv-a");

    expect(statSync(pair.keyPath).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(statSync(pair.publicKeyPath).mode & 0o777).toBe(0o644);
  });

  it("ne sort du dossier de l'app que par sa moitié publique", async () => {
    const dir = keysDir();

    await generateKey(dir, "srv-a");

    const published = readPublicKey(dir, "srv-a");

    expect(published).toContain("ssh-ed25519 ");
    expect(published).not.toContain("PRIVATE KEY");
  });

  it("refuse un identifiant qui sortirait du dossier", async () => {
    const dir = keysDir();

    expect(generateKey(dir, "../../evil")).rejects.toBeInstanceOf(KeyError);
  });

  it("disparaît avec le serveur", async () => {
    const dir = keysDir();
    const pair = await generateKey(dir, "srv-a");

    removeKey(dir, "srv-a");

    expect(readPublicKey(dir, "srv-a")).toBe(null);
    expect(() => statSync(pair.keyPath)).toThrow();
  });
});

describe("une clé importée", () => {
  it("est recopiée dans le dossier de l'app, jamais référencée sur place", async () => {
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

  it("dit ce qui manque quand le fichier n'est pas là", async () => {
    const dir = keysDir();

    expect(importKey(dir, "srv-a", "/nowhere/id_ed25519")).rejects.toThrow(
      /refusal.key.missing/
    );
  });

  it("refuse ce qui n'est pas une clé privée, et dit quoi choisir", async () => {
    const dir = keysDir();
    const source = join(mkdtempSync(join(tmpdir(), "pupitre-src-")), "id.pub");

    writeFileSync(source, "ssh-ed25519 AAAAC3Nz nobody@nowhere\n");

    expect(importKey(dir, "srv-a", source)).rejects.toThrow(
      /refusal.key.public/
    );
  });
});

describe("la commande ssh-copy-id", () => {
  it("porte la clé publique, le port et l'utilisateur du serveur", () => {
    const command = copyIdCommand(SERVER, "/data/keys/srv-a.pub");

    expect(command).toBe(
      "ssh-copy-id -i /data/keys/srv-a.pub -p 2222 root@203.0.113.10"
    );
  });

  it("omet le port par défaut", () => {
    expect(copyIdCommand({ ...SERVER, port: 22 }, "/k.pub")).toBe(
      "ssh-copy-id -i /k.pub root@203.0.113.10"
    );
  });

  it("protège un chemin à espaces, comme celui de l'app sur macOS", () => {
    const command = copyIdCommand(
      SERVER,
      "/Users/moi/Library/Application Support/@pupitre/desktop/keys/srv-a.pub"
    );

    expect(command).toBe(
      "ssh-copy-id -i '/Users/moi/Library/Application Support/@pupitre/desktop/keys/srv-a.pub' -p 2222 root@203.0.113.10"
    );
  });

  it("ferme, échappe et rouvre une apostrophe du chemin", () => {
    expect(copyIdCommand({ ...SERVER, port: 22 }, "/k'a.pub")).toBe(
      "ssh-copy-id -i '/k'\\''a.pub' root@203.0.113.10"
    );
  });
});
