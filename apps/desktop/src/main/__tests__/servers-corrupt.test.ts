import { describe, expect, it, mock } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-corrupt-"));

mock.module("electron", () => electronStub(root));

const { corruptPath, read, reload, write } = await import("../servers");

// The module, and the folder it first pointed at, are shared with the run's other server tests.
const FILE = corruptPath().replace(/\.corrupt$/, "");

writeFileSync(FILE, '{"servers": [ {"id": "srv-1", "name": "x", ');
reload();

const TYPED: Server = {
  host: "198.51.100.7",
  id: "srv-local-1",
  keyPath: join(root, "keys", "srv-local-1"),
  name: "Mon serveur",
  origin: "app",
  port: 22,
  user: "root",
};

describe("an unreadable servers file", () => {
  it("reads as no servers, and its copy stays alongside", () => {
    expect(read().servers).toEqual([]);
    expect(existsSync(corruptPath())).toBe(true);
    expect(readFileSync(corruptPath(), "utf8")).toContain('"srv-1"');
    expect(readFileSync(FILE, "utf8")).toContain('"srv-1"');
  });

  it("refuses any write until it has been read again", () => {
    expect(() =>
      write((current) => ({ ...current, servers: [TYPED] }))
    ).toThrow(/unreadable/);
    expect(readFileSync(FILE, "utf8")).toContain('"srv-1"');
  });

  it("writes again once the file is repaired", () => {
    writeFileSync(
      FILE,
      JSON.stringify({ active: null, dismissed: [], servers: [], version: 3 })
    );

    const written = write((current) => ({ ...current, servers: [TYPED] }));

    expect(written.servers.map((server) => server.id)).toEqual([TYPED.id]);
    expect(JSON.parse(readFileSync(FILE, "utf8")).servers).toHaveLength(1);
    expect(read().servers).toHaveLength(1);
    expect(reload().servers).toHaveLength(1);
  });
});
