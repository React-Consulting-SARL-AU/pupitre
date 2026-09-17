import { beforeEach, describe, expect, it } from "bun:test";
import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import { PROCESSES, SNAPSHOT } from "../../__tests__/snapshot-fixtures";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { REBOOT_PATIENCE_MS, snapshotOf, useSnapshot } from "../snapshot";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });

  return { promise, resolve };
}

function named(hostname: string): SnapshotResult {
  return { ...SNAPSHOT, machine: { ...SNAPSHOT.machine, hostname } };
}

/** Each server's snapshot lands when the test says; every other command answers at once. */
function agents(answers: Record<string, Deferred<SnapshotResult>>): void {
  stubPupitre({
    agentCall: (serverId: string, cmd: string) => {
      const held = answers[serverId];

      if (cmd === "snapshot" && held) {
        return held.promise.then((result) => ({ ok: true, result }));
      }

      return Promise.resolve({
        ok: true,
        result: cmd === "processes.list" ? { processes: PROCESSES } : {},
      });
    },
    agentClose: () => Promise.resolve(),
  } as never);
}

beforeEach(() => {
  useSnapshot.getState().forget();
});

describe("une réponse tardive d'un serveur quitté", () => {
  it("ne se pose pas sur le serveur devenu actif", async () => {
    const a = deferred<SnapshotResult>();
    const b = deferred<SnapshotResult>();
    agents({ "srv-a": a, "srv-b": b });

    const slow = useSnapshot.getState().read("srv-a");
    const fast = useSnapshot.getState().read("srv-b");

    b.resolve(named("b"));
    await fast;

    a.resolve(named("a"));
    await slow;

    const { state } = useSnapshot.getState();

    expect(state).toMatchObject({ serverId: "srv-b", status: "ready" });
    expect(snapshotOf(state)?.machine.hostname).toBe("b");
  });

  it("ne rouvre pas un serveur oublié entre-temps", async () => {
    const a = deferred<SnapshotResult>();
    agents({ "srv-a": a });

    const slow = useSnapshot.getState().read("srv-a");

    useSnapshot.getState().forget();
    a.resolve(named("a"));
    await slow;

    expect(useSnapshot.getState().state).toEqual({ status: "idle" });
  });

  it("ne repeint pas la machine après un redémarrage demandé", async () => {
    const a = deferred<SnapshotResult>();
    agents({ "srv-a": a });

    const slow = useSnapshot.getState().read("srv-a");

    await useSnapshot.getState().reboot("srv-a", "atelier");
    a.resolve(named("a"));
    await slow;

    expect(useSnapshot.getState().state).toMatchObject({
      serverId: "srv-a",
      serverName: "atelier",
      status: "rebooting",
    });
  });
});

describe("un serveur qui redémarre", () => {
  function refusing(): void {
    stubPupitre({
      agentCall: (_serverId: string, cmd: string) =>
        Promise.resolve(
          cmd === "snapshot"
            ? {
                error: { code: "disconnected", message: "connexion fermée" },
                ok: false,
              }
            : { ok: true, result: {} }
        ),
      agentClose: () => Promise.resolve(),
    } as never);
  }

  it("garde son nom et son attente tant que sa lecture refuse", async () => {
    refusing();

    await useSnapshot.getState().reboot("srv-a", "atelier");
    await useSnapshot.getState().read("srv-a");

    expect(useSnapshot.getState().state).toMatchObject({
      serverName: "atelier",
      status: "rebooting",
    });
  });

  it("revient au tableau de bord dès que snapshot répond", async () => {
    refusing();

    await useSnapshot.getState().reboot("srv-a", "atelier");

    const a = deferred<SnapshotResult>();
    agents({ "srv-a": a });

    const read = useSnapshot.getState().read("srv-a");

    expect(useSnapshot.getState().state).toMatchObject({ status: "rebooting" });

    a.resolve(named("a"));
    await read;

    expect(useSnapshot.getState().state).toMatchObject({
      serverId: "srv-a",
      status: "ready",
    });
  });

  it("devient injoignable, avec le refus, une fois sa patience épuisée", async () => {
    refusing();

    await useSnapshot.getState().reboot("srv-a", "atelier");

    const held = useSnapshot.getState().state;

    if (held.status === "rebooting") {
      useSnapshot.setState({
        state: { ...held, since: held.since - REBOOT_PATIENCE_MS - 1 },
      });
    }

    await useSnapshot.getState().read("srv-a");

    expect(useSnapshot.getState().state).toMatchObject({
      error: { code: "disconnected" },
      status: "unreachable",
    });
  });
});

describe("la lecture d'un serveur", () => {
  it("garde le snapshot tel que l'agent le renvoie", async () => {
    const a = deferred<SnapshotResult>();
    agents({ "srv-a": a });

    const read = useSnapshot.getState().read("srv-a");

    expect(useSnapshot.getState().state).toEqual({
      serverId: "srv-a",
      status: "loading",
    });

    a.resolve(named("a"));
    await read;

    expect(snapshotOf(useSnapshot.getState().state)).toEqual(named("a"));
    expect(snapshotOf(useSnapshot.getState().state, "srv-b")).toBeNull();
  });
});

describe("une lecture qui échoue après une réussie", () => {
  it("garde la machine à l'écran et la marque, jusqu'à la lecture suivante", async () => {
    let answering = true;
    stubPupitre({
      agentCall: (_serverId: string, cmd: string) =>
        Promise.resolve(
          cmd === "snapshot" && !answering
            ? {
                ok: false,
                error: {
                  code: "disconnected",
                  message: "La session SSH s'est fermée.",
                },
              }
            : { ok: true, result: cmd === "snapshot" ? named("a") : {} }
        ),
    } as never);

    await useSnapshot.getState().read("srv-a");
    answering = false;
    await useSnapshot.getState().read("srv-a");

    const marked = useSnapshot.getState().state;

    expect(marked).toMatchObject({
      status: "ready",
      stale: { code: "disconnected" },
    });
    expect(snapshotOf(marked)?.machine.hostname).toBe("a");

    answering = true;
    await useSnapshot.getState().read("srv-a");

    expect(useSnapshot.getState().state).not.toHaveProperty("stale");
  });
});

describe("les processus", () => {
  it("garde la table et dit qu'une lecture a échoué, jusqu'à la suivante", async () => {
    let fails = false;

    stubPupitre({
      agentCall: (_serverId: string, cmd: string) =>
        Promise.resolve(
          cmd === "processes.list" && fails
            ? { error: { code: "timeout", message: "trop long" }, ok: false }
            : { ok: true, result: { processes: PROCESSES } }
        ),
    } as never);

    await useSnapshot.getState().readProcesses("srv-1");

    expect(useSnapshot.getState().processes).toEqual(PROCESSES);

    fails = true;
    await useSnapshot.getState().readProcesses("srv-1");

    expect(useSnapshot.getState().processes).toEqual(PROCESSES);
    expect(useSnapshot.getState().processesProblem).toMatchObject({
      code: "timeout",
    });

    fails = false;
    await useSnapshot.getState().readProcesses("srv-1");

    expect(useSnapshot.getState().processesProblem).toBeNull();
  });

  it("note un processus qui survit à son arrêt, et force quand on le demande", async () => {
    const kills: unknown[] = [];
    const first = PROCESSES[0];

    if (!first) {
      throw new Error("the fixture names no process");
    }

    let listed = PROCESSES;

    stubPupitre({
      agentCall: (_serverId: string, cmd: string, params?: unknown) => {
        if (cmd === "process.kill") {
          kills.push(params);

          return Promise.resolve({ ok: true, result: {} });
        }

        return Promise.resolve({ ok: true, result: { processes: listed } });
      },
    } as never);

    await useSnapshot.getState().stopProcess("srv-1", first.pid);

    expect(kills).toEqual([{ pid: first.pid }]);
    expect(useSnapshot.getState().lingering).toEqual([first.pid]);

    await useSnapshot.getState().stopProcess("srv-1", first.pid, true);

    expect(kills[1]).toEqual({ force: true, pid: first.pid });

    listed = PROCESSES.filter((process) => process.pid !== first.pid);
    await useSnapshot.getState().readProcesses("srv-1");

    expect(useSnapshot.getState().lingering).toEqual([]);
  });
});

describe("un geste achevé après un changement de serveur", () => {
  it("ne relit pas le serveur quitté et laisse l'autre à l'écran", async () => {
    const a = deferred<SnapshotResult>();
    const b = deferred<SnapshotResult>();
    const acted = deferred<{ ok: true; result: Record<string, never> }>();
    const asked: string[] = [];

    agents({ "srv-a": a, "srv-b": b });
    stubPupitre({
      ...window.pupitre,
      actOnProject: () => acted.promise,
      agentPoll: (serverId: string, cmd: string) => {
        asked.push(`${serverId}:${cmd}`);

        return window.pupitre.agentCall(serverId, cmd as "snapshot");
      },
    } as never);

    a.resolve(named("a"));
    await useSnapshot.getState().read("srv-a");

    const gesture = useSnapshot.getState().act("project.up", "srv-a", "shop");

    b.resolve(named("b"));
    await useSnapshot.getState().read("srv-b");
    asked.length = 0;

    acted.resolve({ ok: true, result: {} });
    await gesture;

    const { state } = useSnapshot.getState();

    expect(asked).toEqual([]);
    expect(state).toMatchObject({ serverId: "srv-b", status: "ready" });
    expect(snapshotOf(state)?.machine.hostname).toBe("b");
  });

  it("vide la table des processus du serveur quitté dès la lecture du suivant", async () => {
    const a = deferred<SnapshotResult>();
    const b = deferred<SnapshotResult>();

    agents({ "srv-a": a, "srv-b": b });
    a.resolve(named("a"));
    await useSnapshot.getState().read("srv-a");
    await useSnapshot.getState().readProcesses("srv-a");

    expect(useSnapshot.getState().processes).toEqual(PROCESSES);

    const next = useSnapshot.getState().read("srv-b");

    expect(useSnapshot.getState().processes).toEqual([]);
    expect(useSnapshot.getState().lingering).toEqual([]);
    expect(useSnapshot.getState().processesProblem).toBeNull();

    b.resolve(named("b"));
    await next;
  });
});
