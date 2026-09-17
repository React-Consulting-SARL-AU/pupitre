import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";

/**
 * What this file proves: the address, the port and the account of a server
 * change in place, the SSH file the app owns follows, and the pinned host key
 * goes with the address it was pinned for — and only then.
 */

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-update-"));

mock.module("electron", () => ({
  app: { getPath: () => root },
}));

const { paths, read, update, write } = await import("../servers");
const { changeServer, SetupError } = await import("../server-setup");

const PINNED = "SHA256:abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";

const TYPED: Server = {
  host: "198.51.100.7",
  hostFingerprint: PINNED,
  id: "srv-local-1",
  keyPath: join(root, "keys", "srv-local-1"),
  name: "Mon serveur",
  origin: "app",
  port: 22,
  user: "root",
};

const SYSTEM: Server = {
  host: "atelier",
  id: "srv-system-1",
  name: "atelier",
  origin: "system",
  port: 22,
  user: "",
};

function sshConfig(): string {
  return readFileSync(paths().configPath, "utf8");
}

describe("la modification d'un serveur", () => {
  beforeEach(() => {
    write(() => ({
      active: TYPED.id,
      dismissed: [],
      servers: [TYPED, SYSTEM],
    }));
    writeFileSync(
      paths().knownHostsPath,
      `${TYPED.host} ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIGtest\n`
    );
  });

  it("réécrit le bloc de la configuration SSH de l'app", async () => {
    const updated = await update(TYPED.id, { port: 2222, user: "dev" });

    expect(updated.server).toMatchObject({ port: 2222, user: "dev" });
    expect(read().servers[0]).toMatchObject({ port: 2222, user: "dev" });
    expect(sshConfig()).toContain("  Port 2222\n");
    expect(sshConfig()).toContain("  User dev\n");
    expect(sshConfig()).not.toContain("  User root\n");
  });

  it("garde la clé d'hôte épinglée tant que l'adresse ne change pas", async () => {
    const updated = await update(TYPED.id, { user: "dev" });

    expect(updated.hostKeyDropped).toBe(false);
    expect(updated.server.hostFingerprint).toBe(PINNED);
    expect(sshConfig()).toContain("StrictHostKeyChecking yes");
    expect(readFileSync(paths().knownHostsPath, "utf8")).toContain(TYPED.host);
  });

  it("oublie la clé d'hôte quand l'hôte change, et le dit", async () => {
    const updated = await update(TYPED.id, { host: "203.0.113.9" });

    expect(updated.hostKeyDropped).toBe(true);
    expect(updated.server.hostFingerprint).toBeUndefined();
    expect(read().servers[0]?.hostFingerprint).toBeUndefined();
    expect(sshConfig()).toContain("  HostName 203.0.113.9\n");
    expect(sshConfig()).toContain("StrictHostKeyChecking accept-new");
    expect(readFileSync(paths().knownHostsPath, "utf8")).not.toContain(
      TYPED.host
    );
  });

  it("refuse une adresse, un port ou un compte qui n'en sont pas, sans rien écrire", async () => {
    const before = sshConfig();

    await expect(
      update(TYPED.id, { host: "-oProxyCommand=x" })
    ).rejects.toThrow(SetupError);
    await expect(update(TYPED.id, { port: 70_000 })).rejects.toThrow(
      SetupError
    );
    await expect(update(TYPED.id, { user: "dev ops" })).rejects.toThrow(
      SetupError
    );

    expect(sshConfig()).toBe(before);
    expect(read().servers[0]).toMatchObject({ host: TYPED.host, port: 22 });
  });

  it("refuse de toucher un hôte de la configuration du système", async () => {
    await expect(update(SYSTEM.id, { port: 2222 })).rejects.toThrow(SetupError);
  });

  it("nomme le champ refusé, pour que l'écran le marque", () => {
    const refused = (changes: Parameters<typeof changeServer>[2]) => {
      try {
        changeServer([TYPED], TYPED.id, changes);
      } catch (error) {
        return error instanceof SetupError ? error.phrase.id : null;
      }

      return null;
    };

    expect(refused({ host: "bad host" })).toBe("refusal.setup.host");
    expect(refused({ port: 0 })).toBe("refusal.setup.port");
    expect(refused({ user: "" })).toBe("refusal.setup.user");
    expect(refused({ user: "dev" })).toBeNull();
  });
});
