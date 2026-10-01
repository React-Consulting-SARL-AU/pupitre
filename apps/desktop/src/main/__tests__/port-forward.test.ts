import { afterEach, describe, expect, it } from "bun:test";
import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { forwardMemory, readForwardMemory } from "../forwards-memory";
import {
  awaitListening,
  closeForward,
  closeForwards,
  type ForwardDeps,
  forwards,
  openForward,
  watchForwards,
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

describe("a tunnel to a server port", () => {
  it("goes through the ssh of the app's configuration", async () => {
    const harness = deps();

    const answer = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(answer.ok && answer.result.remotePort).toBe(5432);
    expect(answer.ok && answer.result.localPort).toBe(55_001);
    expect(harness.spawned[0]).toEqual([
      "-o",
      "BatchMode=yes",
      "-o",
      "ExitOnForwardFailure=yes",
      "-o",
      "ControlMaster=no",
      "-o",
      "ControlPath=none",
      "-N",
      "-L",
      "55001:127.0.0.1:5432",
      "-F",
      "/tmp/config",
      "pupitre-srv-1",
    ]);
  });

  it("holds its own connection, so closing it frees the port", async () => {
    const harness = deps();

    await openForward(SERVER, 5432, "db.postgres", harness.deps);
    closeForwards();

    expect(harness.spawned[0]).toContain("ControlPath=none");
    expect(harness.born[0]?.killed).toBe(true);
  });

  it("reuses the one already open on this port", async () => {
    const harness = deps();

    const first = await openForward(SERVER, 5432, "db.postgres", harness.deps);
    const second = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(harness.spawned).toHaveLength(1);
    expect(first.ok && second.ok).toBe(true);
    expect(second.ok ? second.result.id : null).toBe(
      first.ok ? first.result.id : ""
    );
  });

  it("takes the local port it is given, and does not reuse another", async () => {
    const harness = deps();

    const login = await openForward(SERVER, 54_545, "login", harness.deps, {
      localPort: 54_545,
    });
    const again = await openForward(SERVER, 54_545, "login", harness.deps, {
      localPort: 54_545,
    });
    const borrowed = await openForward(SERVER, 54_545, "login", harness.deps);

    expect(login.ok && login.result.localPort).toBe(54_545);
    expect(harness.spawned[0]).toContain("54545:127.0.0.1:54545");
    expect(again.ok ? again.result.id : null).toBe(
      login.ok ? login.result.id : ""
    );
    expect(borrowed.ok ? borrowed.result.id : null).toBe(
      login.ok ? login.result.id : ""
    );
    expect(harness.spawned).toHaveLength(1);
  });

  it("closes with its process", async () => {
    const harness = deps();

    const answer = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(forwards(SERVER)).toHaveLength(1);

    closeForward(answer.ok ? answer.result.id : "");

    expect(harness.born[0]?.killed).toBe(true);
    expect(forwards(SERVER)).toEqual([]);
  });

  it("refuses a server the configuration no longer knows", async () => {
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

  it("refuses a port that is not one", async () => {
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

describe("waiting for a local port", () => {
  it("finishes as soon as something listens", async () => {
    const server = createServer();

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve())
    );

    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;

    expect(await awaitListening(port, 2000)).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("gives up when nothing comes", async () => {
    const probe = createServer();

    await new Promise<void>((resolve) =>
      probe.listen(0, "127.0.0.1", () => resolve())
    );

    const address = probe.address();
    const port = address && typeof address === "object" ? address.port : 0;

    await new Promise<void>((resolve) => probe.close(() => resolve()));

    expect(await awaitListening(port, 400)).toBe(false);
  });
});

describe("a redirection's local port, from one run to the next", () => {
  function memoryFile(): string {
    return join(
      mkdtempSync(join(tmpdir(), "pupitre-forwards-")),
      "forwards.json"
    );
  }

  it("is written with its revision, and reused when still free", async () => {
    const file = memoryFile();
    const harness = deps();
    const taken: number[] = [];

    harness.deps.memory = forwardMemory(file);
    harness.deps.portFree = (port) => {
      taken.push(port);

      return Promise.resolve(true);
    };

    const first = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    closeForwards();

    const again = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(first.ok && first.result.localPort).toBe(55_001);
    expect(again.ok && again.result.localPort).toBe(55_001);
    expect(again.ok && again.result.movedFrom).toBeUndefined();
    expect(taken).toEqual([55_001]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual({
      ports: { [SERVER]: { "5432": 55_001 } },
      version: 1,
    });
  });

  it("takes another when the usual port is taken, and says so", async () => {
    const file = memoryFile();
    const harness = deps();

    harness.deps.memory = forwardMemory(file);
    harness.deps.memory.remember(SERVER, 5432, 55_100);
    harness.deps.portFree = () => Promise.resolve(false);

    const answer = await openForward(SERVER, 5432, "db.postgres", harness.deps);

    expect(answer.ok && answer.result.localPort).toBe(55_001);
    expect(answer.ok && answer.result.movedFrom).toBe(55_100);
    expect(readForwardMemory(file).ports[SERVER]?.["5432"]).toBe(
      answer.ok ? answer.result.localPort : 0
    );
  });

  it("does not remember an imposed port, which is not a choice", async () => {
    const file = memoryFile();
    const harness = deps();

    harness.deps.memory = forwardMemory(file);

    await openForward(SERVER, 54_545, "login", harness.deps, {
      localPort: 54_545,
    });

    expect(harness.deps.memory.recall(SERVER, 54_545)).toBeNull();
  });

  it("reads a file from a newer version without rewriting it", () => {
    const file = memoryFile();

    writeFileSync(
      file,
      JSON.stringify({ ports: { [SERVER]: { "5432": 55_009 } }, version: 9 })
    );

    const memory = forwardMemory(file);

    memory.remember(SERVER, 3306, 55_010);

    expect(memory.recall(SERVER, 5432)).toBe(55_009);
    expect(JSON.parse(readFileSync(file, "utf8")).version).toBe(9);
    expect(JSON.parse(readFileSync(file, "utf8")).ports[SERVER]["3306"]).toBe(
      undefined
    );
  });

  it("tells listeners about every opening and closing, the process's included", async () => {
    const harness = deps();
    const seen: number[] = [];
    const stop = watchForwards((list) => seen.push(list.length));

    const one = await openForward(SERVER, 5432, "db.postgres", harness.deps);
    const two = await openForward(SERVER, 3306, "db.mysql", harness.deps);

    closeForward(one.ok ? one.result.id : "");
    harness.born[1]?.emit("exit", 0);
    stop();
    closeForwards();

    expect(two.ok).toBe(true);
    expect(seen).toEqual([1, 2, 1, 0]);
  });
});
