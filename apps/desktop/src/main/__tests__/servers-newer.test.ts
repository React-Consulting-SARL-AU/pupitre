import { describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-newer-"));

mock.module("electron", () => electronStub(root));

const { corruptPath, read, reload, rename } = await import("../servers");

const FILE = corruptPath().replace(/\.corrupt$/, "");

const NEWER = JSON.stringify({
  active: "srv-local-1",
  dismissed: [],
  later: { kept: true },
  servers: [
    {
      host: "198.51.100.7",
      id: "srv-local-1",
      name: "Mon serveur",
      origin: "app",
      port: 22,
      shape: "tomorrow",
      user: "root",
    },
  ],
  version: 99,
});

describe("a servers file written by a newer version", () => {
  it("reads, and a change holds for the session without touching the file", () => {
    writeFileSync(FILE, NEWER);
    reload();

    expect(read().servers.map((server) => server.id)).toEqual(["srv-local-1"]);

    const renamed = rename("srv-local-1", "Renommé");

    expect(renamed.servers[0]?.name).toBe("Renommé");
    expect(readFileSync(FILE, "utf8")).toBe(NEWER);
  });
});
