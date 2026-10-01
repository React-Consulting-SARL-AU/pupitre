import { beforeEach, describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { CATALOG } from "../../__tests__/catalog-fixtures";
import { MANAGED } from "../../__tests__/probe-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useAccount } from "../account";
import { useCatalog } from "../catalog";
import { useHarden } from "../harden";
import { useInspection } from "../inspection";
import { useInstall } from "../install";
import {
  forgetOnboarding,
  savedOnboarding,
  useOnboarding,
} from "../onboarding";
import {
  type Event,
  ONBOARDING_STEPS,
  type OnboardingStep,
} from "../onboarding-machine";
import { useServers } from "../servers";

function catalogue(): void {
  useCatalog.setState({
    catalog: { catalog: CATALOG, serverId: "srv-1", status: "ready" },
    selected: ["db.postgres", "runtime.node"],
  });
}

function machine(
  installed: readonly string[],
  agentVersion: string | null = "0.4.0"
): ProbeResult {
  return {
    ...MANAGED,
    agent_version: agentVersion,
    installed_modules: [...installed],
  };
}

const REPORT = {
  agent_version: "0.4.0",
  failed: [],
  finished_at: "2026-01-01T00:00:10Z",
  modules: [],
  report_path: "/var/lib/pupitre/report.json",
  started_at: "2026-01-01T00:00:00Z",
  warned: [],
};

// A step is only reached through an event that justifies it, never by naming it.
const ONWARD: Record<OnboardingStep, Event> = {
  server: { serverId: "srv-1", type: "serverChosen" },
  inspection: { type: "needsAgent" },
  agent: { type: "agentSent" },
  restore: { type: "restoreSkipped" },
  catalog: { type: "chosen" },
  config: { type: "configured" },
  install: { type: "installed" },
  harden: { type: "hardened" },
  data: { type: "dataSkipped" },
  done: { type: "close" },
};

// The draft is only saved after a typing pause; the tests wait the same pause as the app.
function settledDraft(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 450));
}

function walkTo(step: OnboardingStep): void {
  const store = useOnboarding.getState();

  for (let guard = 0; guard < ONBOARDING_STEPS.length + 1; guard += 1) {
    const here = useOnboarding.getState().step;

    if (here === step) {
      return;
    }

    store.send(ONWARD[here === "closed" ? "server" : here]);
  }

  throw new Error(`${step} is not reachable from here`);
}

function server(probe: ProbeResult): void {
  stubPupitre({
    catalog: () => Promise.resolve({ ok: true, result: CATALOG }),
    forgetInstallSecrets: () => Promise.resolve(),
    generateInstallSecret: () => Promise.resolve({ ok: true, result: {} }),
    inspect: () => Promise.resolve({ ok: true, result: probe }),
    installReport: () => Promise.resolve({ ok: true, result: REPORT }),
  });
}

function knownServers(ids: readonly string[]): void {
  useServers.setState({
    config: {
      active: ids[0] ?? null,
      dismissed: [],
      servers: ids.map((id) => ({
        host: "203.0.113.10",
        id,
        keyPath: `/data/keys/${id}`,
        name: id,
        origin: "app" as const,
        port: 22,
        user: "root",
      })),
    },
    status: "ready",
  });
}

// Every store starts fresh; only the saved draft survives.
function relaunch(): void {
  useOnboarding.setState({
    delivery: { status: "idle" },
    installed: false,
    recovering: false,
    remaining: [],
    replaying: null,
    serverId: null,
    step: "closed",
  });
  useCatalog.getState().reset();
  useInspection.getState().forget();
  useInspection.setState({ probes: {} });
  useInstall.getState().reset();
}

beforeEach(() => {
  // The machine acts on entering a step, so even pure ordering tests need a bridge.
  stubPupitre({});
  forgetOnboarding();
  useOnboarding.getState().reset();
  useCatalog.getState().reset();
  useInspection.getState().forget();
  useInspection.setState({ probes: {} });
  useInstall.getState().reset();
  useServers.setState({ config: null, status: "idle" });
  useAccount.setState({ view: { status: "unknown" } });
});

describe("the onboarding order", () => {
  it("goes from the server to hardening, the agent before the catalogue", () => {
    const store = useOnboarding.getState();

    store.open();
    expect(useOnboarding.getState().step).toBe("server");

    store.begin("srv-1");
    expect(useOnboarding.getState().step).toBe("inspection");

    walkTo("agent");
    walkTo("catalog");
    walkTo("config");
    walkTo("install");
    walkTo("harden");

    expect(useOnboarding.getState().step).toBe("harden");
  });

  it("ends on the final screen, as soon as hardening and the data are done", () => {
    expect(ONBOARDING_STEPS.slice(-3)).toEqual(["harden", "data", "done"]);
  });

  it("goes back as long as nothing is installed", () => {
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("catalog");

    expect(useOnboarding.getState().canGoBack()).toBe(true);

    store.back();
    expect(useOnboarding.getState().step).toBe("agent");
  });

  it("no longer goes back once the installation has started", () => {
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("install");
    store.send({ type: "touched" });

    expect(useOnboarding.getState().canGoBack()).toBe(false);

    store.back();
    expect(useOnboarding.getState().step).toBe("install");
  });
});

describe("what the store does on entering a step", () => {
  it("reads the machine as soon as the server is chosen, only once", () => {
    let asked = 0;

    stubPupitre({
      inspect: () => {
        asked += 1;

        return Promise.resolve({ ok: true, result: machine([]) });
      },
    });

    useOnboarding.getState().begin("srv-1");

    expect(asked).toBe(1);
    expect(useInspection.getState().inspection).toMatchObject({
      serverId: "srv-1",
      status: "running",
    });
  });

  it("does not reread the machine when returning to the inspection", () => {
    let asked = 0;

    stubPupitre({
      inspect: () => {
        asked += 1;

        return Promise.resolve({ ok: true, result: machine([]) });
      },
    });

    useOnboarding.getState().begin("srv-1");
    walkTo("agent");
    useOnboarding.getState().back();

    expect(useOnboarding.getState().step).toBe("inspection");
    expect(asked).toBe(1);
  });

  it("launches the installation of the catalogue choice, with its configuration", async () => {
    const sent: { modules: readonly string[]; config: unknown }[] = [];

    stubPupitre({
      startInstall: (_serverId, modules, config) => {
        sent.push({ config, modules });

        return Promise.resolve({
          ok: true,
          result: { failed: [], report_path: "/r.json", warned: [] },
        });
      },
    });
    catalogue();
    useCatalog.setState({
      values: { "db.postgres": { port: 5432 }, "runtime.node": {} },
    });

    useOnboarding.getState().begin("srv-1");
    walkTo("install");
    await useCatalog.getState().settled();
    await Promise.resolve();

    expect(sent).toEqual([
      {
        config: { "db.postgres": { port: 5432 }, "runtime.node": {} },
        modules: ["db.postgres", "runtime.node"],
      },
    ]);
  });

  it("installs nothing when nothing is chosen", async () => {
    let asked = 0;

    stubPupitre({
      startInstall: () => {
        asked += 1;

        return Promise.resolve({
          ok: true,
          result: { failed: [], report_path: "/r.json", warned: [] },
        });
      },
    });

    useOnboarding.getState().begin("srv-1");
    walkTo("install");
    await Promise.resolve();

    expect(asked).toBe(0);
    expect(useInstall.getState().install.status).toBe("idle");
  });

  it("rereads the machine only once on resumption", async () => {
    let asked = 0;

    stubPupitre({
      catalog: () => Promise.resolve({ ok: true, result: CATALOG }),
      generateInstallSecret: () => Promise.resolve({ ok: true, result: {} }),
      inspect: () => {
        asked += 1;

        return Promise.resolve({ ok: true, result: machine([]) });
      },
    });

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    asked = 0;
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("catalog");
    expect(asked).toBe(1);
  });
});

describe("a licence the console no longer confirms", () => {
  const refused = {
    build: "production" as const,
    checkedAt: null,
    consoleUrl: "https://app.pupitre.test/dashboard",
    device: null,
    identity: null,
    refusal: {
      code: "license_required",
      fix: "Ouvre la console.",
      message: "La licence a expiré.",
    },
    sealed: true,
    usage: {
      consoleUrl: "https://app.pupitre.test/dashboard",
      status: "absent" as const,
    },
  };

  it("freezes the step when the account loses its licence, releases it when it returns", () => {
    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    useAccount.setState({ view: { account: refused, status: "read" } });

    expect(useOnboarding.getState().frozen).toBe(true);
    useOnboarding.getState().send({ type: "chosen" });
    expect(useOnboarding.getState().step).toBe("catalog");

    useAccount.setState({
      view: { account: { ...refused, refusal: null }, status: "read" },
    });

    expect(useOnboarding.getState().frozen).toBe(false);
    useOnboarding.getState().send({ type: "chosen" });
    expect(useOnboarding.getState().step).toBe("config");
  });
});

describe("a machine that leaves the list", () => {
  it("does not reopen a resumption whose server has vanished", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    knownServers(["srv-2"]);
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("closed");
    expect(savedOnboarding()).toBeNull();
  });

  it("resumes as before when the list still holds it", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    knownServers(["srv-1"]);
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("catalog");
  });

  it("returns to the choice when it is removed along the way", () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    knownServers(["srv-2"]);

    expect(useOnboarding.getState().step).toBe("server");
    expect(useOnboarding.getState().serverId).toBeNull();
  });

  it("leaves the choice open on the list it has just read", () => {
    useOnboarding.getState().open();
    knownServers([]);

    expect(useOnboarding.getState().step).toBe("server");
  });
});

describe("an app that restarts", () => {
  it("resumes the onboarding where it had stopped", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("catalog");
    expect(useOnboarding.getState().serverId).toBe("srv-1");
  });

  it("reopens nothing when the onboarding went all the way through", async () => {
    useOnboarding.getState().begin("srv-1");
    walkTo("done");
    useOnboarding.getState().close();

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("closed");
  });

  it("keeps the step that was left so it can be resumed from the servers screen", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("install");
    useOnboarding.getState().close();

    expect(useOnboarding.getState().step).toBe("closed");

    await useOnboarding.getState().resume();
    expect(useOnboarding.getState().step).toBe("install");
  });

  it("restores the catalogue choice and the answers typed", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("runtime.node");
    walkTo("config");

    // The app closes on the form, so no step change follows the value.
    useCatalog.getState().setValue("runtime.node", "version", "22");
    await settledDraft();

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("config");
    expect(useCatalog.getState().selected).toContain("runtime.node");
    expect(useCatalog.getState().values["runtime.node"]).toMatchObject({
      version: "22",
    });
  });

  it("does not offer again what the machine already runs", async () => {
    server(machine(["core.system", "runtime.node"]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("runtime.node");
    walkTo("config");

    relaunch();
    await useOnboarding.getState().resume();

    expect(useCatalog.getState().selected).not.toContain("runtime.node");
    expect(useCatalog.getState().selected).not.toContain("core.system");
  });

  it("rereads the report when the installation had gone all the way through", async () => {
    server(machine(["core.system", "core.hardening", "runtime.node"]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("runtime.node");
    walkTo("install");
    useOnboarding.getState().send({ type: "touched" });

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("install");
    expect(useOnboarding.getState().remaining).toEqual([]);
    expect(useInstall.getState().install.status).toBe("done");
  });

  it("asks again for the configuration of secret-bearing modules that an interruption left behind", async () => {
    server(machine(["core.system", "core.hardening"]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("db.postgres");
    walkTo("install");
    useOnboarding.getState().send({ type: "touched" });

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("config");
    expect(useOnboarding.getState().remaining).toEqual(["db.postgres"]);
    expect(useInstall.getState().install.status).toBe("idle");
  });

  it("restarts the installation of what is missing when no secret is involved", async () => {
    server(machine(["core.system", "core.hardening"]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("runtime.node");
    walkTo("install");
    useOnboarding.getState().send({ type: "touched" });

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("install");
    expect(useOnboarding.getState().remaining).toEqual(["runtime.node"]);
  });

  it("rereads the machine without rebuilding anything once the installation is done", async () => {
    server(machine(["core.system", "exposure.cloudflare"]));

    useOnboarding.getState().begin("srv-1");
    walkTo("harden");

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("harden");
    expect(useInspection.getState().probes["srv-1"]?.installed_modules).toEqual(
      ["core.system", "exposure.cloudflare"]
    );
    expect(useCatalog.getState().catalog.status).toBe("idle");
  });

  it("relaunches the hardening of an installed server without going through the other steps", () => {
    let hardened = 0;

    knownServers(["srv-1"]);
    stubPupitre({
      harden: () => {
        hardened += 1;

        return new Promise(() => undefined);
      },
    });

    useHarden.getState().reset();
    useOnboarding.getState().secure("srv-1");

    expect(useOnboarding.getState()).toMatchObject({
      serverId: "srv-1",
      step: "harden",
    });
    expect(hardened).toBe(1);
  });

  it("relaunches hardening when the resumption lands on it and nothing is running", async () => {
    let hardened = 0;

    server(machine(["core.system", "core.hardening"]));
    stubPupitre({
      ...window.pupitre,
      harden: () => {
        hardened += 1;

        return new Promise(() => undefined);
      },
    });

    useHarden.getState().reset();
    useOnboarding.getState().begin("srv-1");
    walkTo("harden");

    expect(hardened).toBe(1);

    relaunch();
    useHarden.getState().reset();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("harden");
    expect(hardened).toBe(2);
    expect(useHarden.getState().harden).toMatchObject({
      serverId: "srv-1",
      status: "running",
    });
  });

  it("does not relaunch a hardening already under way on the same machine", async () => {
    let hardened = 0;

    server(machine(["core.system", "core.hardening"]));
    stubPupitre({
      ...window.pupitre,
      harden: () => {
        hardened += 1;

        return new Promise(() => undefined);
      },
    });

    useHarden.getState().reset();
    useOnboarding.getState().begin("srv-1");
    walkTo("harden");

    relaunch();
    await useOnboarding.getState().resume();

    expect(hardened).toBe(1);
  });

  it("sends back to the agent step when the binary never reached the machine", async () => {
    server(machine([], null));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("agent");
  });

  it("sends back to the inspection when the machine no longer responds", async () => {
    stubPupitre({
      inspect: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "disconnected",
            fix: "Vérifie que le serveur est allumé et joignable.",
            message: "Le serveur n'a pas répondu.",
          },
        }),
    });

    useOnboarding.getState().begin("srv-1");
    walkTo("install");
    useOnboarding.getState().send({ type: "touched" });

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("inspection");
    expect(useOnboarding.getState().recovering).toBe(false);
  });
});

describe("the draft belongs to its server", () => {
  it("does not make a new onboarding inherit the previous one's choice", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("db.postgres");

    useOnboarding.getState().begin("srv-2");

    expect(savedOnboarding()).toMatchObject({
      selected: [],
      serverId: "srv-2",
    });
  });

  it("ignores the catalogue opened on another machine", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("db.postgres");

    // Loaded for another machine, so this selection is not the one the onboarding expects.
    await useCatalog.getState().load("srv-2");
    useCatalog.getState().toggle("runtime.node");
    walkTo("config");
    await settledDraft();

    expect(savedOnboarding()?.selected).toContain("db.postgres");
    expect(savedOnboarding()?.selected).not.toContain("runtime.node");
  });
});

describe("replaying a module", () => {
  it("goes back through the configuration when the module carried a secret", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("install");
    store.send({ type: "touched" });

    expect(store.replay("db.postgres")).toBe("config");
    expect(useOnboarding.getState().step).toBe("config");
    expect(useOnboarding.getState().replaying).toBe("db.postgres");
  });

  it("restarts directly when the module carried none", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("install");
    store.send({ type: "touched" });

    expect(store.replay("runtime.node")).toBe("install");
    expect(useOnboarding.getState().step).toBe("install");
    expect(useOnboarding.getState().replaying).toBeNull();
  });

  it("returns to the installation once the configuration is redone", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("install");
    store.replay("db.postgres");
    store.send({ type: "replayConfigured" });

    expect(useOnboarding.getState().step).toBe("install");
    expect(useOnboarding.getState().replaying).toBeNull();
  });
});

describe("sending the agent binary", () => {
  it("keeps what the server received", async () => {
    stubPupitre({
      sendAgent: () =>
        Promise.resolve({
          ok: true,
          result: {
            arch: "amd64",
            bytes: 18_000_000,
            path: "/usr/local/bin/pupitred",
            sha256: "a".repeat(64),
          },
        }),
    });

    useOnboarding.getState().begin("srv-1");
    await useOnboarding.getState().sendAgent();

    expect(useOnboarding.getState().delivery).toMatchObject({
      delivery: { arch: "amd64", path: "/usr/local/bin/pupitred" },
      status: "sent",
    });
  });

  it("keeps the agent's fix on failure", async () => {
    stubPupitre({
      sendAgent: () =>
        Promise.resolve({
          ok: false,
          error: {
            code: "disconnected",
            fix: "Vérifie que le compte utilisé peut écrire dans /usr/local/bin.",
            message: "L'agent n'a pas pu être installé sur le serveur.",
          },
        }),
    });

    useOnboarding.getState().begin("srv-1");
    await useOnboarding.getState().sendAgent();

    expect(useOnboarding.getState().delivery).toMatchObject({
      error: {
        fix: "Vérifie que le compte utilisé peut écrire dans /usr/local/bin.",
      },
      status: "failed",
    });
  });

  it("does not send a second binary while the first is on its way", async () => {
    let sent = 0;
    let settle: () => void = () => undefined;

    stubPupitre({
      sendAgent: () => {
        sent += 1;

        return new Promise((resolve) => {
          settle = () =>
            resolve({
              ok: true,
              result: {
                arch: "amd64",
                bytes: 18_000_000,
                path: "/usr/local/bin/pupitred",
                sha256: "a".repeat(64),
              },
            });
        });
      },
    });

    useOnboarding.getState().begin("srv-1");

    const first = useOnboarding.getState().sendAgent();
    const second = useOnboarding.getState().sendAgent();

    settle();
    await Promise.all([first, second]);

    expect(sent).toBe(1);
    expect(useOnboarding.getState().delivery).toMatchObject({ status: "sent" });
  });
});
