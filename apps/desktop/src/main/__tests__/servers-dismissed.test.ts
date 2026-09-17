import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";

/**
 * What this file proves: a granted server removed from this computer stays
 * removed. Without that memory, the merge would take it back on the next read —
 * the platform still grants it — and the removal would never look like it
 * happened.
 */

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-"));

mock.module("electron", () => ({
  app: { getPath: () => root },
}));

const { read, remove, restore, write } = await import("../servers");

const GRANTED: Server = {
  grant: {
    adopted: true,
    id: "srv-platform-1",
    keyReady: true,
    listed: true,
    opened: false,
    status: "active",
  },
  host: "203.0.113.10",
  id: "srv-platform-1",
  keyPath: join(root, "keys", "device"),
  name: "vps-atelier",
  origin: "app",
  port: 22,
  user: "dev",
};

const TYPED: Server = {
  host: "198.51.100.7",
  id: "srv-local-1",
  keyPath: join(root, "keys", "srv-local-1"),
  name: "Mon serveur",
  origin: "app",
  port: 22,
  user: "root",
};

describe("le retrait d'un serveur", () => {
  beforeEach(() => {
    write(() => ({
      active: null,
      dismissed: [],
      servers: [GRANTED, TYPED],
    }));
  });

  it("note l'identifiant de plateforme du serveur attribué", async () => {
    expect((await remove(GRANTED.id)).dismissed).toEqual(["srv-platform-1"]);
  });

  it("ne note rien pour un serveur que la plateforme n'attribue pas", async () => {
    expect((await remove(TYPED.id)).dismissed).toEqual([]);
  });

  it("survit à la relecture du fichier", async () => {
    await remove(GRANTED.id);

    expect(read().dismissed).toEqual(["srv-platform-1"]);
    expect(read().servers.map((server) => server.id)).toEqual(["srv-local-1"]);
  });

  it("s'efface quand on redemande les serveurs attribués", async () => {
    await remove(GRANTED.id);

    expect(restore().dismissed).toEqual([]);
  });

  it("n'est pas perdu par un renommage ni par un changement de serveur piloté", async () => {
    const { activate, rename } = await import("../servers");

    await remove(GRANTED.id);
    rename(TYPED.id, "Atelier");
    activate(TYPED.id);

    expect(read().dismissed).toEqual(["srv-platform-1"]);
  });
});
