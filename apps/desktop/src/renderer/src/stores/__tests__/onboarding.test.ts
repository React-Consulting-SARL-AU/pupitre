import { beforeEach, describe, expect, it } from "bun:test";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { CATALOG } from "../../__tests__/catalog-fixtures";
import { MANAGED } from "../../__tests__/probe-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { useAccount } from "../account";
import { useCatalog } from "../catalog";
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

/**
 * A step is never reached by naming it: it is reached by an event that
 * justifies it. Walking there is what a reader does, and what these tests do.
 */
const ONWARD: Record<OnboardingStep, Event> = {
  server: { serverId: "srv-1", type: "serverChosen" },
  inspection: { type: "needsAgent" },
  agent: { type: "agentSent" },
  catalog: { type: "chosen" },
  config: { type: "configured" },
  install: { type: "installed" },
  harden: { type: "hardened" },
  done: { type: "close" },
};

/**
 * The draft waits for a pause before it reaches the shelf: a keystroke is not a
 * reason to touch the disk. These tests wait the same pause the app does.
 */
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

/** What the machine answers a relaunched app, and nothing more. */
function server(probe: ProbeResult): void {
  stubPupitre({
    catalog: () => Promise.resolve({ ok: true, result: CATALOG }),
    forgetInstallSecrets: () => Promise.resolve(),
    generateInstallSecret: () => Promise.resolve({ ok: true, result: {} }),
    inspect: () => Promise.resolve({ ok: true, result: probe }),
    installReport: () => Promise.resolve({ ok: true, result: REPORT }),
  });
}

/** The list of machines as the app has just read it. */
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

/** A relaunch: every store is new, and only the shelf crossed over. */
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
  // The machine acts on entering a step, so every test needs a bridge, even the
  // ones that only look at the order the steps come in.
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

describe("l'ordre de l'onboarding", () => {
  it("va du serveur au durcissement, l'agent avant le catalogue", () => {
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

  it("finit sur l'écran de fin, sitôt le durcissement passé", () => {
    expect(ONBOARDING_STEPS.slice(-2)).toEqual(["harden", "done"]);
  });

  it("revient en arrière tant que rien n'est installé", () => {
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("catalog");

    expect(useOnboarding.getState().canGoBack()).toBe(true);

    store.back();
    expect(useOnboarding.getState().step).toBe("agent");
  });

  it("ne revient plus en arrière une fois l'installation lancée", () => {
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("install");
    store.send({ type: "touched" });

    expect(useOnboarding.getState().canGoBack()).toBe(false);

    store.back();
    expect(useOnboarding.getState().step).toBe("install");
  });
});

describe("ce que le store fait en entrant dans une étape", () => {
  it("lit la machine dès le choix du serveur, une seule fois", () => {
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

  it("ne relit pas la machine en revenant sur l'inspection", () => {
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

  it("lance l'installation du choix du catalogue, avec sa configuration", async () => {
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

  it("n'installe rien quand rien n'est choisi", async () => {
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

  it("relit la machine une seule fois à la reprise", async () => {
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

describe("un droit d'usage que la console ne confirme plus", () => {
  const refused = {
    build: "production" as const,
    checkedAt: null,
    consoleUrl: "https://app.pupitre.test/dashboard",
    device: null,
    identity: null,
    refusal: {
      code: "entitlement_required",
      fix: "Ouvre la console.",
      message: "Le droit d'usage a expiré.",
    },
    sealed: true,
    usage: {
      consoleUrl: "https://app.pupitre.test/dashboard",
      status: "absent" as const,
    },
  };

  it("gèle l'étape quand le compte perd son droit, la libère quand il revient", () => {
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

describe("une machine qui quitte la liste", () => {
  it("ne rouvre pas une reprise dont le serveur a disparu", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    knownServers(["srv-2"]);
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("closed");
    expect(savedOnboarding()).toBeNull();
  });

  it("reprend comme avant quand la liste la tient toujours", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    knownServers(["srv-1"]);
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("catalog");
  });

  it("ramène au choix quand elle est retirée en cours de route", () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    knownServers(["srv-2"]);

    expect(useOnboarding.getState().step).toBe("server");
    expect(useOnboarding.getState().serverId).toBeNull();
  });

  it("laisse le choix ouvert sur la liste qu'elle vient de lire", () => {
    useOnboarding.getState().open();
    knownServers([]);

    expect(useOnboarding.getState().step).toBe("server");
  });
});

describe("une app qui redémarre", () => {
  it("reprend l'onboarding là où il s'était arrêté", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("catalog");
    expect(useOnboarding.getState().serverId).toBe("srv-1");
  });

  it("ne rouvre rien quand l'onboarding est allé au bout", async () => {
    useOnboarding.getState().begin("srv-1");
    walkTo("done");
    useOnboarding.getState().close();

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("closed");
  });

  it("garde l'étape quittée pour la reprendre depuis l'écran des serveurs", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("install");
    useOnboarding.getState().close();

    expect(useOnboarding.getState().step).toBe("closed");

    await useOnboarding.getState().resume();
    expect(useOnboarding.getState().step).toBe("install");
  });

  it("retrouve le choix du catalogue et les réponses saisies", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("runtime.node");
    walkTo("config");

    // The app closes on the form: the value is written without any step
    // changing after it.
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

  it("ne repropose pas ce que la machine fait déjà tourner", async () => {
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

  it("relit le rapport quand l'installation était allée au bout", async () => {
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

  it("redemande la configuration des modules à secret qu'une coupure a laissés", async () => {
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

  it("repart sur l'installation de ce qui manque quand aucun secret n'est en jeu", async () => {
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

  it("relit la machine sans rien rebâtir une fois l'installation passée", async () => {
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

  it("renvoie à l'agent quand le binaire n'est jamais arrivé sur la machine", async () => {
    server(machine([], null));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");

    relaunch();
    await useOnboarding.getState().resume();

    expect(useOnboarding.getState().step).toBe("agent");
  });

  it("renvoie à l'inspection quand la machine ne répond plus", async () => {
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

describe("le brouillon appartient à son serveur", () => {
  it("ne fait pas hériter un nouvel onboarding du choix du précédent", async () => {
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

  it("ignore le catalogue ouvert sur une autre machine", async () => {
    server(machine([]));

    useOnboarding.getState().begin("srv-1");
    walkTo("catalog");
    await useCatalog.getState().load("srv-1");
    useCatalog.getState().toggle("db.postgres");

    // The same store, loaded on a different machine: its selection isn't
    // the one this onboarding expects.
    await useCatalog.getState().load("srv-2");
    useCatalog.getState().toggle("runtime.node");
    walkTo("config");
    await settledDraft();

    expect(savedOnboarding()?.selected).toContain("db.postgres");
    expect(savedOnboarding()?.selected).not.toContain("runtime.node");
  });
});

describe("rejouer un module", () => {
  it("repasse par la configuration quand le module portait un secret", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("install");
    store.send({ type: "touched" });

    expect(store.replay("db.postgres")).toBe("config");
    expect(useOnboarding.getState().step).toBe("config");
    expect(useOnboarding.getState().replaying).toBe("db.postgres");
  });

  it("repart directement quand le module n'en portait pas", () => {
    catalogue();
    const store = useOnboarding.getState();

    store.begin("srv-1");
    walkTo("install");
    store.send({ type: "touched" });

    expect(store.replay("runtime.node")).toBe("install");
    expect(useOnboarding.getState().step).toBe("install");
    expect(useOnboarding.getState().replaying).toBeNull();
  });

  it("revient à l'installation une fois la configuration refaite", () => {
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

describe("l'envoi du binaire de l'agent", () => {
  it("garde ce que le serveur a reçu", async () => {
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

  it("garde le remède de l'agent en cas d'échec", async () => {
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
});
