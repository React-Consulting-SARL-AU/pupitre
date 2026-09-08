import { beforeEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Server } from "@shared/servers";

/**
 * What this file proves: the identity the platform gives a server when
 * enrolling it is written at once. Without it, the installation that follows
 * does not know which platform server it is talking about, and everything the
 * platform manages for it — tunnel, subdomain — is refused.
 */

const root = mkdtempSync(join(tmpdir(), "pupitre-grant-"));

mock.module("electron", () => ({
  app: { getPath: () => root },
}));

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

describe("l'identité de plateforme d'un serveur", () => {
  beforeEach(() => {
    write({ active: null, dismissed: [], servers: [TYPED] });
  });

  it("s'écrit au premier enrôlement", () => {
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

  it("ne recouvre pas ce que la plateforme a dit depuis", () => {
    write({
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
    });

    noteGrant(TYPED.id, "srv-platform-1");

    expect(byId(TYPED.id)?.grant).toMatchObject({
      keyReady: true,
      opened: true,
      status: "active",
    });
  });

  it("suit le serveur quand un ré-enrôlement lui donne un autre identifiant", () => {
    noteGrant(TYPED.id, "srv-platform-1");
    noteGrant(TYPED.id, "srv-platform-2");

    expect(byId(TYPED.id)?.grant?.id).toBe("srv-platform-2");
  });

  it("ne touche pas un serveur que la liste ne connaît pas", () => {
    expect(noteGrant("srv-absent", "srv-platform-9").servers).toHaveLength(1);
  });
});
