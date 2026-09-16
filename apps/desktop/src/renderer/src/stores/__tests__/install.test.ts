import { beforeEach, describe, expect, it } from "bun:test";
import type {
  InstallResult,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import type { InstallUpdate } from "@shared/install";
import { CATALOG } from "../../__tests__/catalog-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useCatalog } from "../catalog";
import { useChannel } from "../channel";
import { useInstall } from "../install";

const SERVER = "srv-1";
const REPORT = "/var/lib/pupitre/report.json";

type Sent = {
  serverId: string;
  modules: readonly string[];
  config: ModuleConfig;
};

function step(
  module: string,
  name: string,
  status: "start" | "ok" | "skip" | "fail",
  ms: number,
  replay?: string
): InstallUpdate {
  return {
    kind: "event",
    event: {
      id: 2,
      event: "step",
      module,
      step: name,
      status,
      ms,
      ...(replay ? { replay } : {}),
    },
  };
}

function agent(
  script: readonly InstallUpdate[],
  result: InstallResult
): { sent: Sent[] } {
  const sent: Sent[] = [];

  stubPupitre({
    startInstall: (serverId, modules, config, onUpdate) => {
      sent.push({ config, modules, serverId });

      for (const update of script) {
        onUpdate(update);
      }

      return Promise.resolve({ ok: true, result });
    },
  });

  return { sent };
}

beforeEach(() => {
  useInstall.getState().reset();
  useCatalog.getState().reset();
});

describe("un préréglage installé de bout en bout", () => {
  const script: InstallUpdate[] = [
    step("core.system", "paquets", "start", 0),
    step("core.system", "paquets", "ok", 12_400),
    step("runtime.node", "mise", "start", 0),
    step("runtime.node", "mise", "ok", 31_000),
  ];

  it("rend chaque module, ses étapes et leur durée", async () => {
    agent(script, { failed: [], warned: [], report_path: REPORT });

    await useInstall.getState().start(SERVER, ["core.system", "runtime.node"], {
      "core.system": { timezone: "Europe/Paris" },
      "runtime.node": {},
    });

    expect(useInstall.getState().modules).toEqual([
      {
        id: "core.system",
        status: "ok",
        ms: 12_400,
        steps: [{ step: "paquets", status: "ok", ms: 12_400 }],
      },
      {
        id: "runtime.node",
        status: "ok",
        ms: 31_000,
        steps: [{ step: "mise", status: "ok", ms: 31_000 }],
      },
    ]);
  });

  it("finit sur le rapport de l'agent, sans échec", async () => {
    agent(script, {
      failed: [],
      warned: ["runtime.node"],
      report_path: REPORT,
    });

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "runtime.node"], {});

    expect(useInstall.getState().install).toEqual({
      status: "done",
      serverId: SERVER,
      result: { failed: [], warned: ["runtime.node"], report_path: REPORT },
    });
    expect(useInstall.getState().counts()).toEqual({ done: 2, total: 2 });
  });

  it("compte les modules pendant que l'installation avance", async () => {
    const seen: { done: number; total: number }[] = [];

    stubPupitre({
      startInstall: (_serverId, _modules, _config, onUpdate) => {
        for (const update of script) {
          onUpdate(update);
          seen.push(useInstall.getState().counts());
        }

        return Promise.resolve({
          ok: true,
          result: { failed: [], warned: [], report_path: REPORT },
        });
      },
    });

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "runtime.node"], {});

    expect(seen).toEqual([
      { done: 0, total: 2 },
      { done: 1, total: 2 },
      { done: 1, total: 2 },
      { done: 2, total: 2 },
    ]);
  });
});

describe("l'envoi de l'agent avant l'installation", () => {
  it("dit ce qui se passe pendant que le binaire part", async () => {
    const seen: string[] = [];

    stubPupitre({
      startInstall: (_serverId, _modules, _config, onUpdate) => {
        onUpdate({ kind: "sending", arch: "arm64" });
        seen.push(useInstall.getState().install.status);
        onUpdate({ kind: "sent", arch: "arm64", bytes: 18_000_000 });
        onUpdate(step("core.system", "paquets", "start", 0));
        seen.push(useInstall.getState().install.status);

        return Promise.resolve({
          ok: true,
          result: { failed: [], warned: [], report_path: REPORT },
        });
      },
    });

    await useInstall.getState().start(SERVER, ["core.system"], {});

    expect(seen).toEqual(["sending", "running"]);
    expect(useInstall.getState().log[0]).toContain("arm64");
  });
});

describe("un module en échec", () => {
  const script: InstallUpdate[] = [
    step("core.system", "paquets", "start", 0),
    step("core.system", "paquets", "ok", 12_400),
    step("db.mysql", "apt", "start", 0),
    step("db.mysql", "apt", "fail", 9100, "pupitred install db.mysql"),
    step("runtime.node", "mise", "start", 0),
    step("runtime.node", "mise", "ok", 31_000),
  ];

  const result: InstallResult = {
    failed: ["db.mysql"],
    warned: [],
    report_path: REPORT,
  };

  it("garde l'échec sur son module et laisse les autres réussir", async () => {
    agent(script, result);

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "db.mysql", "runtime.node"], {});

    expect(
      useInstall.getState().modules.map((m) => `${m.id} ${m.status}`)
    ).toEqual(["core.system ok", "db.mysql fail", "runtime.node ok"]);
    expect(useInstall.getState().install).toMatchObject({
      status: "done",
      result: { failed: ["db.mysql"] },
    });
  });

  it("garde la commande de rejeu que l'agent a donnée", async () => {
    agent(script, result);

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "db.mysql", "runtime.node"], {});

    const failed = useInstall
      .getState()
      .modules.find((module) => module.id === "db.mysql");

    expect(failed?.steps.at(-1)?.replay).toBe("pupitred install db.mysql");
  });

  it("rejoue ce seul module, avec sa seule configuration", async () => {
    const { sent } = agent(script, result);

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "db.mysql", "runtime.node"], {
        "core.system": { timezone: "Europe/Paris" },
        "db.mysql": { version: "8.4" },
        "runtime.node": {},
      });

    agent([step("db.mysql", "apt", "ok", 8300)], {
      failed: [],
      warned: [],
      report_path: REPORT,
    });

    await useInstall.getState().replay(SERVER, "db.mysql");

    expect(sent).toHaveLength(1);
    expect(useInstall.getState().modules.map((one) => one.id)).toEqual([
      "core.system",
      "db.mysql",
      "runtime.node",
    ]);
    expect(
      useInstall.getState().modules.find((one) => one.id === "db.mysql")
    ).toEqual({
      id: "db.mysql",
      status: "ok",
      ms: 8300,
      steps: [{ step: "apt", status: "ok", ms: 8300 }],
    });
    expect(
      useInstall.getState().modules.find((one) => one.id === "core.system")
        ?.status
    ).toBe("ok");
    expect(useInstall.getState().install).toMatchObject({
      status: "done",
      result: { failed: [] },
    });
  });

  it("garde les autres échecs quand un seul module est rejoué", async () => {
    agent(script, { ...result, failed: ["db.mysql", "runtime.node"] });

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "db.mysql", "runtime.node"], {});

    agent([step("db.mysql", "apt", "ok", 8300)], {
      failed: [],
      warned: ["db.mysql"],
      report_path: REPORT,
    });

    await useInstall.getState().replay(SERVER, "db.mysql");

    expect(useInstall.getState().failed()).toEqual(["runtime.node"]);
    expect(useInstall.getState().warned()).toEqual(["db.mysql"]);
  });

  it("rejoue tout ce qui a échoué, avec la configuration donnée", async () => {
    const { sent } = agent(script, {
      ...result,
      failed: ["db.mysql", "runtime.node"],
    });

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "db.mysql", "runtime.node"], {
        "core.system": { timezone: "Europe/Paris" },
        "db.mysql": { version: "8.4" },
        "runtime.node": { node_versions: ["22"] },
      });

    const again = agent([], { failed: [], warned: [], report_path: REPORT });

    await useInstall.getState().replayFailed(SERVER);

    expect(sent).toHaveLength(1);
    expect(again.sent).toEqual([
      {
        serverId: SERVER,
        modules: ["db.mysql", "runtime.node"],
        config: {
          "db.mysql": { version: "8.4" },
          "runtime.node": { node_versions: ["22"] },
        },
      },
    ]);
    expect(useInstall.getState().failed()).toEqual([]);
  });

  it("passe le seul module et sa configuration au processus principal", async () => {
    const relayed: Sent[] = [];

    stubPupitre({
      startInstall: (serverId, modules, config) => {
        relayed.push({ config, modules, serverId });

        return Promise.resolve({
          ok: true,
          result: { failed: ["db.mysql"], warned: [], report_path: REPORT },
        });
      },
    });

    await useInstall.getState().start(SERVER, ["core.system", "db.mysql"], {
      "core.system": { timezone: "Europe/Paris" },
      "db.mysql": { version: "8.4" },
    });
    await useInstall.getState().replay(SERVER, "db.mysql");

    expect(relayed.at(-1)).toEqual({
      serverId: SERVER,
      modules: ["db.mysql"],
      config: { "db.mysql": { version: "8.4" } },
    });
  });
});

describe("ce que l'installation refuse de rejouer", () => {
  it("ignore un module qui n'était pas de la sélection", async () => {
    const { sent } = agent([], { failed: [], warned: [], report_path: REPORT });

    await useInstall.getState().start(SERVER, ["core.system"], {});
    await useInstall.getState().replay(SERVER, "db.mongodb");

    expect(sent).toHaveLength(1);
  });
});

describe("ce que l'agent renvoie en échec", () => {
  it("garde le message et le remède tels quels", async () => {
    stubPupitre({
      startInstall: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "disconnected",
            message: "La connexion au serveur s'est interrompue.",
            fix: "Vérifie que le serveur répond, puis relance la commande.",
          },
        }),
    });

    await useInstall.getState().start(SERVER, ["core.system"], {});

    expect(useInstall.getState().install).toEqual({
      status: "failed",
      serverId: SERVER,
      error: {
        code: "disconnected",
        message: "La connexion au serveur s'est interrompue.",
        fix: "Vérifie que le serveur répond, puis relance la commande.",
      },
    });
  });

  /** A refused configuration names its fields: the form marks them, as `install.check` would have. */
  it("pose sur les champs du catalogue ce que l'installation a refusé", async () => {
    useCatalog.setState({
      attempted: false,
      catalog: { catalog: CATALOG, serverId: SERVER, status: "ready" },
      refused: [],
      selected: ["core.system", "db.mysql"],
    });
    stubPupitre({
      startInstall: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "invalid_config",
            message: "db.mysql: buffer_pool dépasse la mémoire de la machine",
            remedy: {
              code: "invalid_fields",
              problems: [
                { code: "max", field: "buffer_pool", module: "db.mysql" },
              ],
            },
          },
        }),
    });

    await useInstall.getState().start(SERVER, ["core.system", "db.mysql"], {});

    expect(useInstall.getState().install).toMatchObject({
      error: { code: "invalid_config" },
      status: "failed",
    });
    expect(useCatalog.getState().attempted).toBe(true);
    expect(
      useCatalog.getState().refused.map((one) => [one.module, one.field])
    ).toEqual([["db.mysql", "buffer_pool"]]);
    expect(useCatalog.getState().refused[0]?.declared?.key).toBe("buffer_pool");
  });
});

describe("la reprise après une coupure", () => {
  it("relit le rapport et redessine ce que la machine a fait", async () => {
    stubPupitre({
      installReport: () =>
        Promise.resolve({
          ok: true,
          result: {
            started_at: "2026-09-04T12:00:00Z",
            finished_at: "2026-09-04T12:03:00Z",
            agent_version: "0.1.0",
            modules: [
              {
                id: "db.postgres",
                status: "ok",
                steps: [
                  { step: "apt", status: "ok", ms: 4200 },
                  { step: "cluster", status: "ok", ms: 900 },
                ],
              },
            ],
            failed: [],
            warned: ["db.postgres"],
            report_path: REPORT,
          },
        }),
    });

    await useInstall.getState().reload(SERVER);

    expect(useInstall.getState().modules).toEqual([
      {
        id: "db.postgres",
        status: "ok",
        ms: 5100,
        steps: [
          { step: "apt", status: "ok", ms: 4200 },
          { step: "cluster", status: "ok", ms: 900 },
        ],
      },
    ]);
    expect(useInstall.getState().install).toMatchObject({
      status: "done",
      result: { failed: [], warned: ["db.postgres"], report_path: REPORT },
    });
  });

  it("dit qu'aucune installation n'a encore eu lieu", async () => {
    stubPupitre({
      installReport: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "no_report",
            message: "Aucune installation n'a eu lieu sur ce serveur.",
          },
        }),
    });

    await useInstall.getState().reload(SERVER);

    expect(useInstall.getState().install).toMatchObject({
      status: "failed",
      error: { code: "no_report" },
    });
  });
});

describe("ce que le renderer garde d'une installation", () => {
  it("n'en garde aucun secret : ni dans l'état, ni dans le journal", async () => {
    const script: InstallUpdate[] = [
      step("db.postgres", "apt", "ok", 4200),
      step("db.postgres", "cluster", "ok", 900),
    ];
    const { sent } = agent(script, {
      failed: [],
      warned: [],
      report_path: REPORT,
    });

    await useInstall.getState().start(SERVER, ["db.postgres"], {
      "db.postgres": { version: "17" },
    });

    const state = useInstall.getState();
    const seen = JSON.stringify({
      install: state.install,
      log: state.log,
      modules: state.modules,
      sent,
    });

    expect(seen).not.toContain("password");
    expect(seen).not.toContain("secret");
    expect(seen).toContain("db.postgres");
  });
});

describe("ce que l'installation a touché", () => {
  it("ne compte rien tant qu'aucun module n'a commencé", async () => {
    stubPupitre({
      startInstall: () =>
        Promise.resolve({
          ok: false,
          error: { code: "bad_request", message: "refusé avant tout" },
        }),
    });

    await useInstall.getState().start(SERVER, ["core.system"], {});

    expect(useInstall.getState().install.status).toBe("failed");
    expect(useInstall.getState().touched()).toBe(false);
  });

  it("ne laisse pas tourner un module dont la dernière étape n'est jamais revenue", async () => {
    agent(
      [
        step("tool.neon", "install-neonctl", "start", 0),
        step("tool.neon", "install-neonctl", "ok", 34_900),
        step("tool.neon", "store-key", "start", 0),
      ],
      { failed: [], report_path: REPORT, warned: [] }
    );

    await useInstall.getState().start(SERVER, ["tool.neon"], {});

    expect(useInstall.getState().modules).toEqual([
      {
        id: "tool.neon",
        status: "ok",
        ms: 34_900,
        steps: [{ step: "install-neonctl", status: "ok", ms: 34_900 }],
      },
    ]);
    expect(useInstall.getState().counts()).toEqual({ done: 1, total: 1 });
  });

  it("donne à un module resté ouvert l'échec que le rapport lui donne", async () => {
    agent([step("exposure.cloudflare", "verify-tunnel", "start", 0)], {
      failed: ["exposure.cloudflare"],
      report_path: REPORT,
      warned: [],
    });

    await useInstall.getState().start(SERVER, ["exposure.cloudflare"], {});

    expect(useInstall.getState().modules[0]?.status).toBe("fail");
  });

  it("compte dès la première étape ouverte", async () => {
    agent([step("core.system", "paquets", "start", 0)], {
      failed: [],
      report_path: REPORT,
      warned: [],
    });

    await useInstall.getState().start(SERVER, ["core.system"], {});

    expect(useInstall.getState().touched()).toBe(true);
  });
});

describe("une liaison qui revient", () => {
  it("relit le rapport de ce qui s'est fait sans elle", async () => {
    let reads = 0;

    stubPupitre({
      installReport: () => {
        reads += 1;

        return Promise.resolve({
          ok: true,
          result: {
            agent_version: "0.2.0",
            failed: [],
            finished_at: "2026-09-09T10:00:10Z",
            modules: [
              {
                id: "core.system",
                status: "ok",
                steps: [{ step: "paquets", status: "ok", ms: 12_400 }],
              },
            ],
            report_path: REPORT,
            started_at: "2026-09-09T10:00:00Z",
            warned: [],
          },
        });
      },
      startInstall: (_serverId, _modules, _config, onUpdate) => {
        onUpdate(step("core.system", "paquets", "start", 0));

        return Promise.resolve({
          ok: false,
          error: { code: "disconnected", message: "Liaison perdue." },
        });
      },
    });

    await useInstall.getState().start(SERVER, ["core.system"], {});
    expect(useInstall.getState().install.status).toBe("failed");

    useChannel.getState().note(SERVER, "lost");
    useChannel.getState().note(SERVER, "open");
    await Promise.resolve();

    expect(reads).toBe(1);
    expect(useInstall.getState().install).toMatchObject({
      status: "done",
      result: { failed: [] },
    });
  });
});

describe("un agent qui finit sans avoir rien dit", () => {
  it("ne laisse aucun module en attente une fois le résultat arrivé", async () => {
    agent([], { failed: ["db.mysql"], warned: [], report_path: REPORT });

    await useInstall.getState().start(SERVER, ["core.system", "db.mysql"], {});

    expect(
      useInstall.getState().modules.map((module) => [module.id, module.status])
    ).toEqual([
      ["core.system", "ok"],
      ["db.mysql", "fail"],
    ]);
    expect(useInstall.getState().counts()).toEqual({ done: 2, total: 2 });
  });
});

describe("un rapport que la machine écrit encore", () => {
  function report(finishedAt: string, steps: readonly string[]) {
    return {
      ok: true as const,
      result: {
        agent_version: "0.0.0-test",
        failed: [],
        finished_at: finishedAt,
        modules: [
          {
            id: "core.system",
            status: "ok" as const,
            steps: steps.map((name, index) => ({
              ms: index === steps.length - 1 && finishedAt === "" ? 0 : 900,
              status:
                index === steps.length - 1 && finishedAt === ""
                  ? ("start" as const)
                  : ("ok" as const),
              step: name,
            })),
          },
        ],
        report_path: REPORT,
        started_at: "2026-09-04T12:00:00Z",
        warned: [],
      },
    };
  }

  it("se relit jusqu'à ce qu'il soit fini, sans se dire terminé avant", async () => {
    const answers = [
      report("", ["paquets", "fuseau"]),
      report("", ["paquets", "fuseau"]),
      report("2026-09-04T12:04:00Z", ["paquets", "fuseau"]),
    ];
    let reads = 0;

    stubPupitre({
      installReport: () => {
        reads += 1;

        return Promise.resolve(answers[Math.min(reads, answers.length) - 1]);
      },
    });
    useInstall.setState({ pollMs: 1 });

    const reading = useInstall.getState().reload(SERVER);
    await Promise.resolve();

    expect(useInstall.getState().install.status).toBe("running");
    expect(
      useInstall.getState().modules.map((module) => [module.id, module.status])
    ).toEqual([["core.system", "running"]]);

    await reading;

    expect(reads).toBe(3);
    expect(useInstall.getState().install).toMatchObject({
      status: "done",
      result: { failed: [], report_path: REPORT },
    });
    expect(useInstall.getState().counts()).toEqual({ done: 1, total: 1 });
  });

  it("suit l'installation qu'un agent occupé mène déjà, au lieu d'échouer", async () => {
    const answers = [
      report("", ["paquets"]),
      report("2026-09-04T12:04:00Z", ["paquets", "fuseau"]),
    ];
    let reads = 0;

    stubPupitre({
      installReport: () => {
        reads += 1;

        return Promise.resolve(answers[Math.min(reads, answers.length) - 1]);
      },
      startInstall: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "busy",
            message: "une installation est déjà en cours",
            fix: "Attendez la fin de l'installation en cours.",
          },
        }),
    });
    useInstall.setState({ pollMs: 1 });

    await useInstall.getState().start(SERVER, ["core.system"], {});

    expect(reads).toBe(2);
    expect(useInstall.getState().install).toMatchObject({
      status: "done",
      result: { failed: [] },
    });
    expect(
      useInstall.getState().modules.map((module) => module.status)
    ).toEqual(["ok"]);
  });

  it("s'arrête de relire quand l'écran est réinitialisé", async () => {
    let reads = 0;

    stubPupitre({
      installReport: () => {
        reads += 1;

        return Promise.resolve(report("", ["paquets"]));
      },
    });
    useInstall.setState({ pollMs: 1 });

    const reading = useInstall.getState().reload(SERVER);
    await Promise.resolve();
    useInstall.getState().reset();
    await reading;

    expect(reads).toBe(1);
    expect(useInstall.getState().install.status).toBe("idle");
  });
});

describe("l'installation de ce que le catalogue a choisi", () => {
  it("part avec la sélection, sa configuration et ce qui est remis à plus tard", async () => {
    const { sent } = agent([], { failed: [], warned: [], report_path: REPORT });
    useCatalog.setState({
      deferred: ["db.postgres", "ai.claude"],
      selected: ["core.system", "db.postgres"],
      values: { "core.system": { timezone: "Africa/Casablanca" } },
    });

    await useInstall.getState().startChosen(SERVER);

    expect(sent).toEqual([
      {
        serverId: SERVER,
        modules: ["core.system", "db.postgres"],
        config: {
          "core.system": { timezone: "Africa/Casablanca" },
          "db.postgres": {},
        },
      },
    ]);
    expect(useInstall.getState().requested.defer).toEqual(["db.postgres"]);
    expect(useInstall.getState().install.status).toBe("done");
  });
});
