import { beforeEach, describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { announces, ofServer, useAgentUpdate } from "../agent-update";

const SERVER = "srv-1";

const OFFER = {
  arch: "amd64",
  notes: ["Mise à jour de l'agent depuis l'app."],
  signed: true,
  source: "app" as const,
  version: "0.4.0",
};

const SHEET = { config: null, floor: "0.1.0", verdict: "ok" as const };

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
          result: {
            ...SHEET,
            installed: "0.3.0",
            offer: OFFER,
            order: "ahead",
            platform: true,
          },
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
            ...SHEET,
            installed: reads === 1 ? "0.3.0" : "0.4.0",
            offer: OFFER,
            order: reads === 1 ? "ahead" : "same",
            platform: true,
          },
        });
      },
      upgradeAgent: (_serverId, onEvent) => {
        onEvent(log("version 0.4.0 téléchargée"));
        onEvent(log("agent 0.4.0 installé"));

        return Promise.resolve({
          ok: true,
          result: {
            migration: null,
            upgrade: {
              previous_version: "0.3.0",
              restarting: true,
              version: "0.4.0",
            },
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
      serverId: SERVER,
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

describe("la migration de la configuration", () => {
  it("garde ce que l'agent a porté, et relit l'écart", async () => {
    stubPupitre({
      agentUpdateState: () =>
        Promise.resolve({
          ok: true,
          result: {
            ...SHEET,
            installed: "0.4.0",
            offer: OFFER,
            order: "same" as const,
            platform: true,
          },
        }),
      migrateAgentConfig: () =>
        Promise.resolve({
          ok: true,
          result: {
            applied: [{ id: 2, ms: 11, slug: "rename-tz" }],
            expected: 2,
            pending: [],
            restored: false,
            revision: 2,
            state: "current" as const,
          },
        }),
    });

    await useAgentUpdate.getState().migrateConfig(SERVER);

    expect(useAgentUpdate.getState().migration).toMatchObject({
      result: { revision: 2 },
      status: "done",
    });
  });

  it("garde le remède quand la migration est refusée", async () => {
    stubPupitre({
      agentUpdateState: () =>
        Promise.resolve({
          ok: true,
          result: {
            ...SHEET,
            installed: "0.4.0",
            offer: OFFER,
            order: "same" as const,
            platform: true,
          },
        }),
      migrateAgentConfig: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "busy",
            fix: "Relance la migration quand l'installation est finie.",
            message: "une installation est en cours",
          },
        }),
    });

    await useAgentUpdate.getState().migrateConfig(SERVER);

    expect(useAgentUpdate.getState().migration).toMatchObject({
      error: { code: "busy" },
      status: "failed",
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
      update: {
        ...SHEET,
        installed: "0.3.0",
        offer: OFFER,
        order: "ahead" as const,
        platform: true,
      },
    };
    const behind = {
      ...ahead,
      update: { ...ahead.update, order: "behind" as const },
    };

    expect(announces(ahead, null)).toBe(true);
    expect(announces(behind, null)).toBe(true);
  });

  it("parle toujours d'une configuration que l'agent ne lit pas, même masquée", () => {
    const state = {
      serverId: SERVER,
      status: "ready" as const,
      update: {
        ...SHEET,
        config: { expected: 4, revision: 3, state: "pending" as const },
        installed: "0.4.0",
        offer: OFFER,
        order: "same" as const,
        platform: true,
      },
    };

    expect(announces(state, "0.4.0")).toBe(true);
  });

  it("se tait sur la version que le lecteur a masquée, pas sur la suivante", () => {
    const state = {
      serverId: SERVER,
      status: "ready" as const,
      update: {
        ...SHEET,
        installed: "0.3.0",
        offer: OFFER,
        order: "ahead" as const,
        platform: true,
      },
    };

    expect(announces(state, "0.4.0")).toBe(false);
    expect(announces(state, "0.3.5")).toBe(true);
  });
});

describe("la relecture sur le battement", () => {
  it("relit l'écart comme une lecture ordinaire", async () => {
    let reads = 0;

    stubPupitre({
      agentUpdateState: () => {
        reads += 1;

        return Promise.resolve({
          ok: true,
          result: {
            ...SHEET,
            installed: `0.${reads}.0`,
            offer: null,
            order: "same",
            platform: true,
          },
        });
      },
    });

    await useAgentUpdate.getState().read(SERVER);
    await useAgentUpdate.getState().refresh(SERVER);

    expect(reads).toBe(2);
    expect(useAgentUpdate.getState().state).toMatchObject({
      status: "ready",
      update: { installed: "0.2.0" },
    });
  });

  it("s'efface pendant une mise à jour ou une migration en cours", async () => {
    let reads = 0;

    stubPupitre({
      agentUpdateState: () => {
        reads += 1;

        return Promise.resolve({
          ok: true,
          result: {
            ...SHEET,
            installed: "0.3.0",
            offer: null,
            order: "same",
            platform: true,
          },
        });
      },
    });

    useAgentUpdate.setState({
      upgrade: { serverId: SERVER, status: "running" },
    });
    await useAgentUpdate.getState().refresh(SERVER);

    useAgentUpdate.setState({
      migration: { serverId: SERVER, status: "running" },
      upgrade: { status: "idle" },
    });
    await useAgentUpdate.getState().refresh(SERVER);

    expect(reads).toBe(0);
  });

  it("ne double pas une lecture encore en vol pour la même machine", async () => {
    let reads = 0;
    let settle: () => void = () => undefined;

    stubPupitre({
      agentUpdateState: () => {
        reads += 1;

        return new Promise((resolve) => {
          settle = () =>
            resolve({
              ok: true,
              result: {
                ...SHEET,
                installed: "0.3.0",
                offer: null,
                order: "same",
                platform: true,
              },
            });
        });
      },
    });

    const first = useAgentUpdate.getState().refresh(SERVER);
    const second = useAgentUpdate.getState().refresh(SERVER);
    const third = useAgentUpdate.getState().refresh(SERVER);

    settle();
    await Promise.all([first, second, third]);

    expect(reads).toBe(1);
    expect(useAgentUpdate.getState().state).toMatchObject({
      status: "ready",
      serverId: SERVER,
    });
  });
});

describe("un changement de machine", () => {
  it("laisse tomber la réponse tardive de la machine quittée", async () => {
    const waiting: Record<string, () => void> = {};

    stubPupitre({
      agentUpdateState: (serverId) =>
        new Promise((resolve) => {
          waiting[serverId] = () =>
            resolve({
              ok: true,
              result: {
                ...SHEET,
                installed: serverId === "srv-a" ? "0.2.5" : "0.3.0",
                offer: null,
                order: "same",
                platform: true,
              },
            });
        }),
    });

    const slow = useAgentUpdate.getState().read("srv-a");

    useAgentUpdate.getState().forget();
    const fast = useAgentUpdate.getState().read("srv-b");

    waiting["srv-b"]?.();
    await fast;
    waiting["srv-a"]?.();
    await slow;

    expect(useAgentUpdate.getState().state).toMatchObject({
      serverId: "srv-b",
      status: "ready",
      update: { installed: "0.3.0" },
    });
  });

  it("garde à chaque geste la machine qu'il concerne", async () => {
    stubPupitre({
      agentUpdateState: () =>
        Promise.resolve({
          ok: true,
          result: {
            ...SHEET,
            installed: "0.4.0",
            offer: null,
            order: "same",
            platform: true,
          },
        }),
      migrateAgentConfig: () =>
        Promise.resolve({
          ok: true,
          result: {
            applied: [],
            expected: 2,
            pending: [],
            restored: false,
            revision: 2,
            state: "current" as const,
          },
        }),
      upgradeAgent: () =>
        Promise.resolve({
          ok: true,
          result: {
            migration: null,
            upgrade: {
              previous_version: "0.3.0",
              restarting: true,
              version: "0.4.0",
            },
          },
        }),
      upgradeModules: () =>
        Promise.resolve({
          ok: true,
          result: { failed: [], report_path: "/r", warned: [] },
        }),
    });

    await useAgentUpdate.getState().upgradeAgent("srv-a");
    await useAgentUpdate.getState().migrateConfig("srv-a");
    await useAgentUpdate.getState().upgradeModules("srv-a", ["runtime.node"]);

    const state = useAgentUpdate.getState();

    expect(state.upgrade).toMatchObject({ serverId: "srv-a", status: "done" });
    expect(state.migration).toMatchObject({
      serverId: "srv-a",
      status: "done",
    });
    expect(state.modules).toMatchObject({ serverId: "srv-a", status: "done" });
    expect(ofServer(state.upgrade, "srv-b")).toEqual({ status: "idle" });
    expect(ofServer(state.upgrade, "srv-a")).toBe(state.upgrade);
    expect(ofServer(state.state, "srv-b")).toEqual({ status: "idle" });
  });
});
