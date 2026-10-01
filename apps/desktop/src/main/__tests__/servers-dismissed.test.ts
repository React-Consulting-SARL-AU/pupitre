import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-"));

mock.module("electron", () => electronStub(root));

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

describe("removing a server", () => {
  beforeEach(() => {
    write(() => ({
      active: null,
      dismissed: [],
      servers: [GRANTED, TYPED],
    }));
  });

  it("records the platform id of the assigned server", async () => {
    expect((await remove(GRANTED.id)).dismissed).toEqual(["srv-platform-1"]);
  });

  it("records nothing for a server the platform does not assign", async () => {
    expect((await remove(TYPED.id)).dismissed).toEqual([]);
  });

  it("survives re-reading the file", async () => {
    await remove(GRANTED.id);

    expect(read().dismissed).toEqual(["srv-platform-1"]);
    expect(read().servers.map((server) => server.id)).toEqual(["srv-local-1"]);
  });

  it("is cleared when the assigned servers are requested again", async () => {
    await remove(GRANTED.id);

    expect(restore().dismissed).toEqual([]);
  });

  it("is not lost by a rename or by a change of driven server", async () => {
    const { activate, rename } = await import("../servers");

    await remove(GRANTED.id);
    rename(TYPED.id, "Atelier");
    activate(TYPED.id);

    expect(read().dismissed).toEqual(["srv-platform-1"]);
  });
});
