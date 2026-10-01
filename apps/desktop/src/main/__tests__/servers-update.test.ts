import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-update-"));

mock.module("electron", () => electronStub(root));

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

describe("editing a server", () => {
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

  it("rewrites the block in the app's SSH configuration", async () => {
    const updated = await update(TYPED.id, { port: 2222, user: "dev" });

    expect(updated.server).toMatchObject({ port: 2222, user: "dev" });
    expect(read().servers[0]).toMatchObject({ port: 2222, user: "dev" });
    expect(sshConfig()).toContain("  Port 2222\n");
    expect(sshConfig()).toContain("  User dev\n");
    expect(sshConfig()).not.toContain("  User root\n");
  });

  it("keeps the pinned host key as long as the address does not change", async () => {
    const updated = await update(TYPED.id, { user: "dev" });

    expect(updated.hostKeyDropped).toBe(false);
    expect(updated.server.hostFingerprint).toBe(PINNED);
    expect(sshConfig()).toContain("StrictHostKeyChecking yes");
    expect(readFileSync(paths().knownHostsPath, "utf8")).toContain(TYPED.host);
  });

  it("forgets the host key when the host changes, and says so", async () => {
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

  it("refuses an address, port or account that is not one, writing nothing", async () => {
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

  it("refuses to touch a host from the system configuration", async () => {
    await expect(update(SYSTEM.id, { port: 2222 })).rejects.toThrow(SetupError);
  });

  it("names the refused field, so the screen can mark it", () => {
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
    expect(refused({ slug: "···" })).toBe("refusal.setup.sshName");
    expect(refused({ slug: "pupitre-srv-x" })).toBe("refusal.setup.sshName");
    expect(refused({ user: "dev" })).toBeNull();
  });
});

describe("the SSH name of a server", () => {
  beforeEach(() => {
    write(() => ({
      active: TYPED.id,
      dismissed: [],
      servers: [{ ...TYPED, slug: "mon-serveur" }, SYSTEM],
    }));
  });

  it("changes on the Host line of the app's SSH configuration, the alias kept", async () => {
    expect(sshConfig()).toContain("Host pupitre-srv-local-1 mon-serveur\n");

    const updated = await update(TYPED.id, { slug: "Prod VPS" });

    expect(updated.server.slug).toBe("prod-vps");
    expect(read().servers[0]?.slug).toBe("prod-vps");
    expect(sshConfig()).toContain("Host pupitre-srv-local-1 prod-vps\n");
    expect(sshConfig()).not.toContain("mon-serveur");
  });

  it("falls back to the server name when the field is cleared", async () => {
    await update(TYPED.id, { slug: "prod" });

    const updated = await update(TYPED.id, { slug: "" });

    expect(updated.server.slug).toBe("mon-serveur");
    expect(sshConfig()).toContain("Host pupitre-srv-local-1 mon-serveur\n");
  });

  it("keeps the name when the change does not mention it", async () => {
    const updated = await update(TYPED.id, { port: 2222 });

    expect(updated.server.slug).toBe("mon-serveur");
  });

  it("refuses a word that already names another machine", async () => {
    await expect(update(TYPED.id, { slug: "atelier" })).rejects.toMatchObject({
      phrase: { id: "refusal.setup.sshNameTaken", values: { name: "atelier" } },
    });
    await expect(
      update(TYPED.id, { slug: "pupitre-srv-system-1" })
    ).rejects.toThrow(SetupError);
    expect(read().servers[0]?.slug).toBe("mon-serveur");
  });

  it("can take back its own word", async () => {
    const updated = await update(TYPED.id, { slug: "mon-serveur" });

    expect(updated.server.slug).toBe("mon-serveur");
  });
});
