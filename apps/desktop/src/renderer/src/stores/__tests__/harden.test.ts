import { beforeEach, describe, expect, it } from "bun:test";
import type { HardenUpdate } from "@shared/harden";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useHarden } from "../harden";
import { useServers } from "../servers";

const REASON =
  "Aucune clé n'ouvre le compte dev : /home/dev/.ssh/authorized_keys est vide.";

const NO_SERVERS = {
  servers: () => Promise.resolve({ active: null, servers: [] }),
};

beforeEach(() => {
  useHarden.getState().reset();
});

describe("harden", () => {
  it("keeps the agent's steps and the switch to dev", async () => {
    stubPupitre({
      ...NO_SERVERS,
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

  it("rereads the server list when the app changed account, so every screen talks about dev", async () => {
    let read = 0;

    stubPupitre({
      harden: () =>
        Promise.resolve({
          ok: true,
          result: {
            harden: { next_user: "dev", root_closed: true, root_kept: false },
            reconnected: true,
            user: "dev",
          },
        }),
      servers: () => {
        read += 1;

        return Promise.resolve({ active: "srv-1", servers: [] });
      },
    });

    await useHarden.getState().start("srv-1");

    expect(read).toBe(1);
    expect(useServers.getState().config).toMatchObject({ active: "srv-1" });

    useServers.setState({ config: null });
  });

  it("keeps root open and the reason as the agent gives it", async () => {
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

  it("keeps the agent's fix when the command fails", async () => {
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

describe("a hardening that waits for the channel", () => {
  it("says it is waiting, then that it is working from the first step", async () => {
    const seen: string[] = [];

    stubPupitre({
      ...NO_SERVERS,
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
