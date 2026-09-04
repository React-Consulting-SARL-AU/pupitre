import { afterEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  closeForward,
  closeForwards,
  type ForwardDeps,
  forwards,
  openForward,
} from "../port-forward";

const SERVER = "srv-1";

interface Fake extends EventEmitter {
  killed: boolean;
  kill: () => boolean;
}

function fakeChild(): Fake {
  const child = new EventEmitter() as Fake;

  child.killed = false;
  child.kill = () => {
    child.killed = true;

    return true;
  };

  return child;
}

function deps(): { deps: ForwardDeps; spawned: string[][]; born: Fake[] } {
  const spawned: string[][] = [];
  const born: Fake[] = [];
  let port = 55_000;

  return {
    born,
    deps: {
      freePort: () => {
        port += 1;

        return Promise.resolve(port);
      },
      resolve: (serverId) =>
        serverId === SERVER ? ["-F", "/tmp/config", "pupitre-srv-1"] : null,
      spawn: (args) => {
        spawned.push(args);
        const child = fakeChild();
        born.push(child);

        return child as unknown as ChildProcess;
      },
    },
    spawned,
  };
}

afterEach(() => {
  closeForwards();
});

describe("un tunnel vers un port du serveur", () => {
  it("passe par le ssh de la configuration de l'app", async () => {
    const harness = deps();

    const answer = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(answer.ok && answer.result.remotePort).toBe(5432);
    expect(answer.ok && answer.result.localPort).toBe(55_001);
    expect(harness.spawned[0]).toEqual([
      "-o",
      "BatchMode=yes",
      "-o",
      "ExitOnForwardFailure=yes",
      "-N",
      "-L",
      "55001:127.0.0.1:5432",
      "-F",
      "/tmp/config",
      "pupitre-srv-1",
    ]);
  });

  it("réutilise celui qui est déjà ouvert sur ce port", async () => {
    const harness = deps();

    const first = await openForward(SERVER, 5432, "db.postgres", harness.deps);
    const second = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(harness.spawned).toHaveLength(1);
    expect(first.ok && second.ok).toBe(true);
    expect(second.ok ? second.result.id : null).toBe(
      first.ok ? first.result.id : ""
    );
  });

  it("se ferme avec son processus", async () => {
    const harness = deps();

    const answer = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(forwards(SERVER)).toHaveLength(1);

    closeForward(answer.ok ? answer.result.id : "");

    expect(harness.born[0]?.killed).toBe(true);
    expect(forwards(SERVER)).toEqual([]);
  });

  it("refuse un serveur que la configuration ne connaît plus", async () => {
    const harness = deps();

    const answer = await openForward(
      "srv-2",
      5432,
      "db.postgres",
      harness.deps
    );

    expect(answer.ok).toBe(false);
    expect(harness.spawned).toEqual([]);
  });

  it("refuse un port qui n'en est pas un", async () => {
    const harness = deps();

    const answer = await openForward(
      SERVER,
      70_000,
      "db.postgres",
      harness.deps
    );

    expect(answer.ok).toBe(false);
    expect(harness.spawned).toEqual([]);
  });
});
