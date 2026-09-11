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

  it("prend le port local qu'on lui impose, et n'en réutilise pas un autre", async () => {
    const harness = deps();

    const login = await openForward(SERVER, 54_545, "login", harness.deps, {
      localPort: 54_545,
    });
    const again = await openForward(SERVER, 54_545, "login", harness.deps, {
      localPort: 54_545,
    });
    const borrowed = await openForward(SERVER, 54_545, "login", harness.deps);

    expect(login.ok && login.result.localPort).toBe(54_545);
    expect(harness.spawned[0]?.[6]).toBe("54545:127.0.0.1:54545");
    expect(again.ok ? again.result.id : null).toBe(
      login.ok ? login.result.id : ""
    );
    expect(borrowed.ok ? borrowed.result.id : null).toBe(
      login.ok ? login.result.id : ""
    );
    expect(harness.spawned).toHaveLength(1);
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

describe("l'attente d'un port local", () => {
  it("se termine dès que quelque chose écoute", async () => {
    const server = createServer();

    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => resolve())
    );

    const address = server.address();
    const port = address && typeof address === "object" ? address.port : 0;

    expect(await awaitListening(port, 2000)).toBe(true);

    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("renonce quand rien ne vient", async () => {
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

describe("le port local d'une redirection, d'une fois sur l'autre", () => {
  function memoryFile(): string {
    return join(
      mkdtempSync(join(tmpdir(), "pupitre-forwards-")),
      "forwards.json"
    );
  }

  it("est écrit avec sa révision, et repris quand il est encore libre", async () => {
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

  it("en prend un autre quand le port habituel est pris, et le dit", async () => {
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

  it("ne mémorise pas un port imposé, qui n'est pas un choix", async () => {
    const file = memoryFile();
    const harness = deps();

    harness.deps.memory = forwardMemory(file);

    await openForward(SERVER, 54_545, "login", harness.deps, {
      localPort: 54_545,
    });

    expect(harness.deps.memory.recall(SERVER, 54_545)).toBeNull();
  });

  it("lit un fichier d'une version plus récente sans le réécrire", () => {
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

  it("dit à qui écoute chaque ouverture et chaque fermeture, celle du processus comprise", async () => {
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
