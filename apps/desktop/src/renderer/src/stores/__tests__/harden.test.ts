import { beforeEach, describe, expect, it } from "bun:test";
import type { HardenUpdate } from "@shared/harden";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useHarden } from "../harden";

const REASON =
  "Aucune clé n'ouvre le compte dev : /home/dev/.ssh/authorized_keys est vide.";

beforeEach(() => {
  useHarden.getState().reset();
});

describe("harden", () => {
  it("garde les étapes de l'agent et la bascule sur dev", async () => {
    stubPupitre({
      harden: (_serverId, onUpdate: (update: HardenUpdate) => void) => {
        onUpdate({
          event: {
            event: "step",
            id: 2,
            module: "core.hardening",
            ms: 0,
            status: "start",
            step: "compte dev",
          },
          kind: "event",
        });
        onUpdate({
          event: {
            event: "step",
            id: 2,
            module: "core.hardening",
            ms: 1200,
            status: "ok",
            step: "compte dev",
          },
          kind: "event",
        });
        onUpdate({ kind: "switching", user: "dev" });

        return Promise.resolve({
          ok: true,
          result: {
            harden: { next_user: "dev", root_closed: true, root_kept: false },
            reconnected: true,
            user: "dev",
          },
        });
      },
    });

    await useHarden.getState().start("srv-1");

    expect(useHarden.getState().harden).toMatchObject({
      outcome: { reconnected: true, user: "dev" },
      status: "done",
    });
    expect(useHarden.getState().steps).toEqual([
      { ms: 1200, status: "ok", step: "compte dev" },
    ]);
  });

  it("garde root ouvert et la raison telle que l'agent la donne", async () => {
    stubPupitre({
      harden: () =>
        Promise.resolve({
          ok: true,
          result: {
            harden: {
              next_user: "root",
              reason: REASON,
              root_closed: false,
              root_kept: false,
            },
            reconnected: false,
            user: null,
          },
        }),
    });

    await useHarden.getState().start("srv-1");

    expect(useHarden.getState().harden).toMatchObject({
      outcome: { harden: { reason: REASON, root_closed: false }, user: null },
      status: "done",
    });
  });

  it("garde le remède de l'agent quand la commande échoue", async () => {
    stubPupitre({
      harden: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "disconnected",
            fix: "Vérifie que le serveur répond, puis relance le durcissement.",
            message: "La connexion au serveur s'est interrompue.",
          },
        }),
    });

    await useHarden.getState().start("srv-1");

    expect(useHarden.getState().harden).toMatchObject({
      error: {
        fix: "Vérifie que le serveur répond, puis relance le durcissement.",
      },
      status: "failed",
    });
  });
});

describe("une sécurisation qui attend le canal", () => {
  it("dit qu'elle attend, puis qu'elle travaille dès la première étape", async () => {
    const seen: string[] = [];

    stubPupitre({
      harden: (_serverId, onUpdate: (update: HardenUpdate) => void) => {
        onUpdate({ kind: "queued" });
        seen.push(useHarden.getState().harden.status);

        onUpdate({
          event: {
            event: "step",
            id: 2,
            module: "core.hardening",
            ms: 0,
            status: "start",
            step: "compte dev",
          },
          kind: "event",
        });
        seen.push(useHarden.getState().harden.status);

        return Promise.resolve({
          ok: true,
          result: {
            harden: { next_user: "dev", root_closed: true, root_kept: false },
            reconnected: true,
            user: "dev",
          },
        });
      },
    });

    await useHarden.getState().start("srv-1");

    expect(seen).toEqual(["queued", "running"]);
    expect(useHarden.getState().harden.status).toBe("done");
  });
});
