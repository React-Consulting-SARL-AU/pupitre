import { beforeEach, describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { announces, useAgentUpdate } from "../agent-update";

const SERVER = "srv-1";

const CARRIED = {
  arch: "amd64",
  notes: ["Mise à jour de l'agent depuis l'app."],
  signed: true,
  version: "0.4.0",
};

function log(line: string): Event {
  return { event: "log", id: 2, line } as unknown as Event;
}

function step(module: string, status: string): Event {
  return {
    event: "step",
    id: 2,
    module,
    ms: 1200,
    status,
    step: "paquet",
  } as unknown as Event;
}

beforeEach(() => {
  useAgentUpdate.getState().forget();
  useAgentUpdate.setState({ hidden: null });
});

describe("la lecture de l'écart", () => {
  it("garde la comparaison telle que le processus principal la rend", async () => {
    stubPupitre({
      agentUpdateState: () =>
        Promise.resolve({
          ok: true,
          result: { carried: CARRIED, installed: "0.3.0", order: "ahead" },
        }),
    });

    await useAgentUpdate.getState().read(SERVER);

    expect(useAgentUpdate.getState().state).toMatchObject({
      status: "ready",
      update: { installed: "0.3.0", order: "ahead" },
    });
  });

  it("garde le remède quand la lecture échoue", async () => {
    stubPupitre({
      agentUpdateState: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "disconnected",
            message: "Le serveur ne répond plus.",
            fix: "Vérifie le port 22.",
          },
        }),
    });

    await useAgentUpdate.getState().read(SERVER);

    expect(useAgentUpdate.getState().state).toMatchObject({
      status: "failed",
      error: { fix: "Vérifie le port 22." },
    });
  });
});

describe("la mise à jour de l'agent", () => {
  it("garde le journal de l'agent et relit l'écart", async () => {
    let reads = 0;

    stubPupitre({
      agentUpdateState: () => {
        reads += 1;

        return Promise.resolve({
          ok: true,
          result: {
            carried: CARRIED,
            installed: reads === 1 ? "0.3.0" : "0.4.0",
            order: reads === 1 ? "ahead" : "same",
          },
        });
      },
      upgradeAgent: (_serverId, onEvent) => {
        onEvent(log("version 0.4.0 téléchargée"));
        onEvent(log("agent 0.4.0 installé"));

        return Promise.resolve({
          ok: true,
          result: {
            previous_version: "0.3.0",
            restarting: true,
            version: "0.4.0",
          },
        });
      },
    });

    await useAgentUpdate.getState().read(SERVER);
    await useAgentUpdate.getState().upgradeAgent(SERVER);

    const state = useAgentUpdate.getState();

    expect(state.journal).toEqual([
      "version 0.4.0 téléchargée",
      "agent 0.4.0 installé",
    ]);
    expect(state.upgrade).toMatchObject({ status: "done" });
    expect(state.state).toMatchObject({ update: { order: "same" } });
  });

  it("n'annonce aucune réussite quand l'agent refuse la signature", async () => {
    stubPupitre({
      upgradeAgent: (_serverId, onEvent) => {
        onEvent(log("version 0.4.0 téléchargée"));

        return Promise.resolve({
          ok: false,
          error: {
            code: "bad_signature",
            message: "le binaire ne correspond pas à sa signature",
            fix: "Relance la mise à jour depuis l'app.",
          },
        });
      },
    });

    await useAgentUpdate.getState().upgradeAgent(SERVER);

    expect(useAgentUpdate.getState().upgrade).toEqual({
      status: "failed",
      error: {
        code: "bad_signature",
        message: "le binaire ne correspond pas à sa signature",
        fix: "Relance la mise à jour depuis l'app.",
      },
    });
  });
});

describe("la mise à jour des modules", () => {
  it("compte les étapes de chaque module et garde le rapport", async () => {
    stubPupitre({
      upgradeModules: (_serverId, _modules, onEvent) => {
        onEvent(step("runtime.node", "ok"));
        onEvent(step("db.postgres", "fail"));

        return Promise.resolve({
          ok: true,
          result: {
            failed: ["db.postgres"],
            report_path: "/var/log/pupitre/upgrade.json",
            warned: [],
          },
        });
      },
    });

    await useAgentUpdate
      .getState()
      .upgradeModules(SERVER, ["runtime.node", "db.postgres"]);

    const state = useAgentUpdate.getState();

    expect(state.steps.map((module) => module.status)).toEqual(["ok", "fail"]);
    expect(state.modules).toMatchObject({
      status: "done",
      result: { failed: ["db.postgres"] },
    });
  });
});

describe("ce que le bandeau annonce", () => {
  it("se tait tant que la comparaison n'est pas revenue", () => {
    expect(announces({ status: "idle" }, null)).toBe(false);
  });

  it("parle quand l'app est devant, et quand elle est derrière", () => {
    const ahead = {
      serverId: SERVER,
      status: "ready" as const,
      update: { carried: CARRIED, installed: "0.3.0", order: "ahead" as const },
    };
    const behind = {
      ...ahead,
      update: { ...ahead.update, order: "behind" as const },
    };

    expect(announces(ahead, null)).toBe(true);
    expect(announces(behind, null)).toBe(true);
  });

  it("se tait sur la version que le lecteur a masquée, pas sur la suivante", () => {
    const state = {
      serverId: SERVER,
      status: "ready" as const,
      update: { carried: CARRIED, installed: "0.3.0", order: "ahead" as const },
    };

    expect(announces(state, "0.4.0")).toBe(false);
    expect(announces(state, "0.3.5")).toBe(true);
  });
});
