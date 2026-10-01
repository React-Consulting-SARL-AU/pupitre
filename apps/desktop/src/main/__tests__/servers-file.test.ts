import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { Server } from "@shared/servers";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-file-"));

mock.module("electron", () => electronStub(root));

const { add, corruptPath, noteGrant, read, remove, write } = await import(
  "../servers"
);

// The module is shared across the run's server tests, so the real path comes from the module, not `root`.
const FILE = corruptPath().replace(/\.corrupt$/, "");
const DIR = dirname(FILE);

const TYPED: Server = {
  host: "198.51.100.7",
  id: "srv-local-1",
  keyPath: join(root, "keys", "srv-local-1"),
  name: "Mon serveur",
  origin: "app",
  port: 22,
  user: "root",
};

const OTHER: Server = {
  ...TYPED,
  host: "198.51.100.8",
  id: "srv-local-2",
  keyPath: join(root, "keys", "srv-local-2"),
  name: "L'autre",
};

describe("the servers file", () => {
  beforeEach(() => {
    rmSync(FILE, { force: true });
    rmSync(corruptPath(), { force: true });
    write(() => ({ active: TYPED.id, dismissed: [], servers: [TYPED, OTHER] }));
  });

  it("is written alongside then renamed, never truncated in place", () => {
    write(() => ({ active: TYPED.id, dismissed: [], servers: [TYPED] }));

    expect(readdirSync(DIR).filter((name) => name.endsWith(".tmp"))).toEqual(
      []
    );
    expect(JSON.parse(readFileSync(FILE, "utf8")).servers).toHaveLength(1);
  });

  it("applies the change to what the file holds at the time of writing", async () => {
    const slow = add({
      host: "203.0.113.9",
      key: { mode: "generate" },
      name: "Le lent",
      port: 22,
      user: "root",
    });

    noteGrant(OTHER.id, "srv-platform-2");

    const created = await slow;

    expect(read().servers.map((server) => server.id)).toEqual([
      TYPED.id,
      OTHER.id,
      created.server.id,
    ]);
    expect(read().servers[1]?.grant?.id).toBe("srv-platform-2");
    expect(read().active).toBe(created.server.id);
  });

  it("does not lose an identity recorded while a server is being removed", async () => {
    const removal = remove(TYPED.id);

    noteGrant(OTHER.id, "srv-platform-2");

    await removal;

    expect(read().servers.map((server) => server.id)).toEqual([OTHER.id]);
    expect(read().servers[0]?.grant?.id).toBe("srv-platform-2");
  });
});
