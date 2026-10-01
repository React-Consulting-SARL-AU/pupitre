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

describe("a preset installed end to end", () => {
  const script: InstallUpdate[] = [
    step("core.system", "paquets", "start", 0),
    step("core.system", "paquets", "ok", 12_400),
    step("runtime.node", "mise", "start", 0),
    step("runtime.node", "mise", "ok", 31_000),
  ];

  it("returns each module, its steps and their duration", async () => {
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

  it("ends on the agent's report, without failure", async () => {
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

  it("counts the modules while the installation progresses", async () => {
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

describe("sending the agent before the installation", () => {
  it("says what is happening while the binary is sent", async () => {
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

describe("a failed module", () => {
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

  it("keeps the failure on its module and lets the others succeed", async () => {
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

  it("keeps the replay command the agent gave", async () => {
    agent(script, result);

    await useInstall
      .getState()
      .start(SERVER, ["core.system", "db.mysql", "runtime.node"], {});

    const failed = useInstall
      .getState()
      .modules.find((module) => module.id === "db.mysql");

    expect(failed?.steps.at(-1)?.replay).toBe("pupitred install db.mysql");
  });

  it("replays that module alone, with its own configuration only", async () => {
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

  it("keeps the other failures when only one module is replayed", async () => {
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

  it("replays everything that failed, with the given configuration", async () => {
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

  it("passes only the module and its configuration to the main process", async () => {
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

describe("what a replay carries", () => {
  type Deferred = Sent & { defer: readonly string[] | undefined };

  function deferringAgent(result: InstallResult): { sent: Deferred[] } {
    const sent: Deferred[] = [];

    stubPupitre({
      startInstall: (serverId, modules, config, _onUpdate, defer) => {
        sent.push({ config, defer, modules, serverId });

        return Promise.resolve({ ok: true, result });
      },
    });

    return { sent };
  }

  it("postpones what was postponed, and only among the replayed modules", async () => {
    const { sent } = deferringAgent({
      failed: ["db.mysql", "runtime.node"],
      report_path: REPORT,
      warned: [],
    });

    await useInstall
      .getState()
      .start(
        SERVER,
        ["core.system", "db.mysql", "runtime.node"],
        { "core.system": {}, "runtime.node": {} },
        ["db.mysql"]
      );

    await useInstall.getState().replay(SERVER, "db.mysql");
    await useInstall.getState().replay(SERVER, "runtime.node");
    await useInstall.getState().replayFailed(SERVER);

    expect(sent.slice(1).map((one) => one.defer)).toEqual([
      ["db.mysql"],
      [],
      ["db.mysql"],
    ]);
  });

  it("retains the retyped configuration for the next replay", async () => {
    const { sent } = deferringAgent({
      failed: ["db.mysql"],
      report_path: REPORT,
      warned: [],
    });

    await useInstall.getState().start(SERVER, ["core.system", "db.mysql"], {
      "core.system": {},
      "db.mysql": { version: "8.4" },
    });

    await useInstall
      .getState()
      .replay(SERVER, "db.mysql", { "db.mysql": { version: "9.0" } });
    await useInstall.getState().replayFailed(SERVER);

    expect(useInstall.getState().requested.config["db.mysql"]).toEqual({
      version: "9.0",
    });
    expect(sent.at(-1)?.config).toEqual({ "db.mysql": { version: "9.0" } });
  });
});

describe("secrets after a refused install", () => {
  function marks(): void {
    useCatalog.setState({
      catalog: { catalog: CATALOG, serverId: SERVER, status: "ready" },
      secrets: {
        "db.mysql": {
          app_password: { filled: true, generated: true, revealed: false },
        },
      },
      selected: ["core.system", "db.mysql"],
    });
  }

  it("clears the catalogue marks and says so, when nothing says they are still held", async () => {
    marks();
    stubPupitre({
      startInstall: () =>
        Promise.resolve({
          ok: false,
          error: { code: "internal", message: "refusé" },
        }),
    });

    await useInstall.getState().start(SERVER, ["core.system", "db.mysql"], {});

    expect(useCatalog.getState().secrets).toEqual({});
    expect(useInstall.getState().secretsDropped).toBe(true);
  });

  it("keeps the marks when the main process says it still holds the secrets", async () => {
    marks();
    stubPupitre({
      startInstall: (_serverId, _modules, _config, onUpdate) => {
        onUpdate({ held: true, kind: "secrets" });

        return Promise.resolve({
          ok: false,
          error: { code: "internal", message: "refusé" },
        });
      },
    });

    await useInstall.getState().start(SERVER, ["core.system", "db.mysql"], {});

    expect(
      useCatalog.getState().secrets["db.mysql"]?.app_password?.filled
    ).toBe(true);
    expect(useInstall.getState().secretsDropped).toBe(false);
  });

  it("says nothing when no secret had been typed", async () => {
    stubPupitre({
      startInstall: () =>
        Promise.resolve({
          ok: false,
          error: { code: "internal", message: "refusé" },
        }),
    });

    await useInstall.getState().start(SERVER, ["core.system"], {});

    expect(useInstall.getState().secretsDropped).toBe(false);
  });
});

describe("what the installation refuses to replay", () => {
  it("ignores a module that was not part of the selection", async () => {
    const { sent } = agent([], { failed: [], warned: [], report_path: REPORT });

    await useInstall.getState().start(SERVER, ["core.system"], {});
    await useInstall.getState().replay(SERVER, "db.mongodb");

    expect(sent).toHaveLength(1);
  });
});

describe("what the agent returns on failure", () => {
  it("keeps the message and the fix as they are", async () => {
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

  it("puts on the catalogue fields what the installation refused", async () => {
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

describe("resuming after an interruption", () => {
  it("rereads the report and redraws what the machine did", async () => {
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

  it("says no installation has taken place yet", async () => {
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

describe("what the renderer keeps of an installation", () => {
  it("keeps no secret of it: neither in the state nor in the journal", async () => {
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

describe("what the installation touched", () => {
  it("counts nothing until a module has started", async () => {
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

  it("does not leave running a module whose last step never came back", async () => {
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

  it("gives a module left open the failure the report gives it", async () => {
    agent([step("exposure.cloudflare", "verify-tunnel", "start", 0)], {
      failed: ["exposure.cloudflare"],
      report_path: REPORT,
      warned: [],
    });

    await useInstall.getState().start(SERVER, ["exposure.cloudflare"], {});

    expect(useInstall.getState().modules[0]?.status).toBe("fail");
  });

  it("counts from the first open step", async () => {
    agent([step("core.system", "paquets", "start", 0)], {
      failed: [],
      report_path: REPORT,
      warned: [],
    });

    await useInstall.getState().start(SERVER, ["core.system"], {});

    expect(useInstall.getState().touched()).toBe(true);
  });
});

describe("a link that comes back", () => {
  it("rereads the report of what was done without it", async () => {
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

describe("an agent that finishes without having said anything", () => {
  it("leaves no module pending once the result has arrived", async () => {
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

describe("a report the machine is still writing", () => {
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

  it("is reread until it is finished, without calling itself done before", async () => {
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

  it("follows the installation a busy agent is already running, instead of failing", async () => {
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

  it("stops rereading when the screen is reset", async () => {
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

describe("the installation of what the catalogue chose", () => {
  it("starts with the selection, its configuration and what is postponed", async () => {
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
