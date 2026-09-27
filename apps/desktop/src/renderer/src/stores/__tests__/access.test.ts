import { beforeEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { AccessKey } from "@pupitre/shared/agent-protocol/access";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { opens, useAccess } from "../access";

const SERVER = "srv-1";

const KEYS: AccessKey[] = [
  {
    created_at: "2026-09-27T10:00:00Z",
    id: "device000001",
    name: "atelier",
    projects: null,
  },
  {
    created_at: "2026-09-27T11:00:00Z",
    id: "review000001",
    name: "Recette client",
    projects: ["shop"],
  },
];

function agent(keys: AccessKey[], listed: string[][] = []): void {
  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName) =>
      Promise.resolve(
        cmd === "access.list"
          ? { ok: true, result: { keys } }
          : { error: { code: "internal", message: "rien" }, ok: false }
      ),
    copyAccessKey: (_serverId, _id, form) =>
      Promise.resolve({ ok: true, result: { copied: form } }),
    createAccessKey: (_serverId, name, projects) =>
      Promise.resolve({
        ok: true,
        result: {
          created_at: "2026-09-27T12:00:00Z",
          id: "fresh0000001",
          name,
          projects,
        },
      }),
    heldAccessKeys: (_serverId, ids) => {
      listed.push(ids);

      return Promise.resolve({
        ok: true,
        result: { device: "device000001", held: ["device000001"] },
      });
    },
    revokeAccessKey: () =>
      Promise.resolve({
        error: { code: "privilege_required", message: "mot de passe" },
        ok: false,
      }),
  });
}

beforeEach(() => {
  useAccess.getState().forget();
});

describe("les clés d'accès d'un serveur", () => {
  it("lit les clés, puis ce que cet ordinateur en garde", async () => {
    const listed: string[][] = [];
    agent(KEYS, listed);

    await useAccess.getState().read(SERVER);

    expect(useAccess.getState().state).toMatchObject({
      held: { device: "device000001", held: ["device000001"] },
      keys: KEYS,
      status: "read",
    });
    expect(listed).toEqual([["device000001", "review000001"]]);
  });

  it("dit quelles clés ouvrent un projet", () => {
    const [device, review] = KEYS;

    expect(device && opens(device, "blog")).toBe(true);
    expect(review && opens(review, "blog")).toBe(false);
    expect(review && opens(review, "shop")).toBe(true);
  });

  it("rend la clé créée et relit la liste", async () => {
    agent(KEYS);

    const created = await useAccess.getState().create(SERVER, "iPhone", null);

    expect(created?.id).toBe("fresh0000001");
    expect(useAccess.getState().state.status).toBe("read");
  });

  it("garde le refus d'une révocation sur la clé visée", async () => {
    agent(KEYS);

    await useAccess.getState().revoke(SERVER, "review000001");

    expect(useAccess.getState().gesture).toMatchObject({
      id: "review000001",
      status: "failed",
    });
    expect(useAccess.getState().revoking).toBeNull();
  });

  it("dit ce qu'une copie a mis dans le presse-papiers", async () => {
    agent(KEYS);

    await useAccess.getState().copy(SERVER, "device000001", "header", null);

    expect(useAccess.getState().gesture).toEqual({
      form: "header",
      id: "device000001",
      status: "copied",
    });
  });
});
