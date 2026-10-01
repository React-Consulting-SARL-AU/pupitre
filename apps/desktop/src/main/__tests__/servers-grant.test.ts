import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";
import { electronStub } from "./electron-stub";

const root = mkdtempSync(join(tmpdir(), "pupitre-grant-"));

mock.module("electron", () => electronStub(root));

const { byId, noteGrant, write } = await import("../servers");

const TYPED: Server = {
  host: "198.51.100.7",
  id: "srv-local-1",
  keyPath: join(root, "keys", "srv-local-1"),
  name: "Mon serveur",
  origin: "app",
  port: 22,
  user: "root",
};

describe("the platform identity of a server", () => {
  beforeEach(() => {
    write(() => ({ active: null, dismissed: [], servers: [TYPED] }));
  });

  it("is written at the first enrolment", () => {
    noteGrant(TYPED.id, "srv-platform-1");

    expect(byId(TYPED.id)?.grant).toEqual({
      adopted: false,
      id: "srv-platform-1",
      keyReady: false,
      listed: true,
      opened: false,
      status: "enrolling",
    });
  });

  it("does not overwrite what the platform has said since", () => {
    write(() => ({
      active: null,
      dismissed: [],
      servers: [
        {
          ...TYPED,
          grant: {
            adopted: false,
            id: "srv-platform-1",
            keyReady: true,
            listed: true,
            opened: true,
            status: "active",
          },
        },
      ],
    }));

    noteGrant(TYPED.id, "srv-platform-1");

    expect(byId(TYPED.id)?.grant).toMatchObject({
      keyReady: true,
      opened: true,
      status: "active",
    });
  });

  it("follows the server when a re-enrolment gives it another id", () => {
    noteGrant(TYPED.id, "srv-platform-1");
    noteGrant(TYPED.id, "srv-platform-2");

    expect(byId(TYPED.id)?.grant?.id).toBe("srv-platform-2");
  });

  it("does not touch a server the list does not know", () => {
    expect(noteGrant("srv-absent", "srv-platform-9").servers).toHaveLength(1);
  });
});
