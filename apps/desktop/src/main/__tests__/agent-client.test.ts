import { describe, expect, it } from "bun:test";
import { spawn as spawnChild } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import {
  AgentCallError,
  type AgentClient,
  type AgentClientOptions,
  createAgentClient,
  defaultTimeout,
  sshSpawn,
} from "../agent-client";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

function client(
  fixtures: string | string[],
  options: Partial<Parameters<typeof createAgentClient>[0]> = {}
): { agent: AgentClient; fake: FakeAgent } {
  const fake = fakeAgent(fixtures);
  const agent = createAgentClient({
    spawn: fake.spawn,
    appVersion: "0.1.0",
    backoff: { firstMs: 5, maxMs: 20, attempts: 3 },
    ...options,
  });

  return { agent, fake };
}

async function until(
  condition: () => boolean,
  attempts = 200
): Promise<boolean> {
  for (let i = 0; i < attempts; i += 1) {
    if (condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return condition();
}

function ids(fake: FakeAgent): number[] {
  return fake.trace().map((line) => Number(line.replace(/^id=(\d+).*$/, "$1")));
}

describe("le canal", () => {
  it("dit hello tout seul, puis rejoue la transcription", async () => {
    const { agent, fake } = client("hello-then-ping.jsonl");

    const ping = await agent.call(SERVER, "ping");

    expect(ping.ts).toBe("2026-09-04T12:00:00Z");
    expect(agent.session(SERVER)).toMatchObject({
      agent_version: "0.0.0-test",
      protocol: 1,
      entitlement: "dev",
    });
    expect(agent.capabilities(SERVER)).toContain("snapshot");
    expect(fake.trace()[0]).toBe("id=1 cmd=hello");

    agent.closeAll();
  });

  it("enchaîne cent snapshot sur un seul processus, sans trou dans les id", async () => {
    const { agent, fake } = client("snapshot-loop.jsonl");

    for (let i = 0; i < 100; i += 1) {
      const snapshot = await agent.call(SERVER, "snapshot");
      expect(snapshot.machine.hostname).toBe("staging");
    }

    const seen = ids(fake);

    expect(fake.started()).toBe(1);
    expect(fake.live()).toBe(1);
    expect(seen).toHaveLength(101);
    expect(seen).toEqual(Array.from({ length: 101 }, (_v, i) => i + 1));

    agent.closeAll();

    expect(await until(() => fake.live() === 0)).toBe(true);
  });

  it("reprend le flux d'événements après une coupure, rapport à l'appui", async () => {
    const { agent, fake } = client([
      "install-cut.jsonl",
      "install-resume.jsonl",
    ]);

    const steps: string[] = [];
    const result = (await agent.stream(
      SERVER,
      "install",
      {
        modules: ["db.postgres"],
        config: { "db.postgres": { version: "17" } },
        secrets_stdin: true,
      },
      (event: Event) => {
        steps.push(
          `${String(event.module)} ${String(event.step)} ${String(event.status)}`
        );
      },
      { secrets: { "db.postgres": { app_password: "s3cret-de-test" } } }
    )) as InstallResult;

    expect(steps).toEqual([
      "db.postgres apt start",
      "db.postgres apt ok",
      "db.postgres cluster start",
      "db.postgres cluster ok",
    ]);
    expect(result).toEqual({
      failed: [],
      warned: ["db.postgres"],
      report_path: "/var/lib/pupitre/report.json",
    });
    expect(fake.started()).toBe(2);
    expect(fake.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=install",
      "id=3 cmd=hello",
      "id=4 cmd=report",
    ]);

    agent.closeAll();
  });

  it("dit la coupure, pas l'absence de rapport, quand l'agent n'en a écrit aucun", async () => {
    const { agent, fake } = client([
      "install-cut.jsonl",
      "install-resume-none.jsonl",
    ]);

    const failure = await agent
      .stream(
        SERVER,
        "install",
        {
          modules: ["db.postgres"],
          config: { "db.postgres": { version: "17" } },
          secrets_stdin: true,
        },
        () => undefined,
        { secrets: { "db.postgres": { app_password: "s3cret-de-test" } } }
      )
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(AgentCallError);
    expect((failure as AgentCallError).code).toBe("disconnected");
    expect(fake.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=install",
      "id=3 cmd=hello",
      "id=4 cmd=report",
    ]);

    agent.closeAll();
  });

  it("remonte protocol_mismatch et ne rouvre pas le canal", async () => {
    const { agent, fake } = client("protocol-mismatch.jsonl");

    const first = await agent.call(SERVER, "snapshot").catch((e) => e);
    const second = await agent.call(SERVER, "snapshot").catch((e) => e);

    expect(first).toBeInstanceOf(AgentCallError);
    expect(first.code).toBe("protocol_mismatch");
    expect(first.fix).toBe("Mets à jour l'app jusqu'au protocole 2.");
    expect(second.code).toBe("protocol_mismatch");
    expect(fake.started()).toBe(1);

    agent.closeAll();
  });

  it("n'empoisonne pas la commande suivante avec un timeout", async () => {
    const { agent, fake } = client("snapshot-timeout.jsonl", {
      timeouts: { snapshot: 200 },
    });

    const timedOut = await agent.call(SERVER, "snapshot").catch((e) => e);
    const after = await agent.call(SERVER, "snapshot");

    expect(timedOut).toBeInstanceOf(AgentCallError);
    expect(timedOut.code).toBe("timeout");
    expect(after.machine.hostname).toBe("staging");
    expect(fake.started()).toBe(1);

    agent.closeAll();
  });

  it("installe avec sa ligne de secrets, sans qu'un secret ressorte", async () => {
    const { agent, fake } = client("install-secrets.jsonl");

    const events: Event[] = [];
    const result = (await agent.stream(
      SERVER,
      "install",
      {
        modules: ["db.postgres"],
        config: { "db.postgres": { version: "17" } },
        secrets_stdin: true,
      },
      (event: Event) => events.push(event),
      { secrets: { "db.postgres": { app_password: "s3cret-de-test" } } }
    )) as InstallResult;

    expect(result).toEqual({
      failed: [],
      warned: [],
      report_path: "/var/lib/pupitre/report.json",
    });
    expect(events).toHaveLength(4);

    const seen = [
      JSON.stringify(events),
      JSON.stringify(result),
      fake.trace().join("\n"),
    ].join("\n");

    expect(seen).not.toContain("s3cret-de-test");
    expect(seen).not.toContain("app_password");

    agent.closeAll();
  });

  it("rend l'enveloppe du protocole à ce qui traverse l'IPC", async () => {
    const { agent } = client("protocol-mismatch.jsonl");

    const response = await agent.request(SERVER, "snapshot");

    expect(response).toEqual({
      ok: false,
      error: {
        code: "protocol_mismatch",
        message:
          "protocole 1 non pris en charge : cet agent parle le protocole 2",
        fix: "Mets à jour l'app jusqu'au protocole 2.",
      },
    });

    agent.closeAll();
  });
});

describe("la détection d'un projet", () => {
  it("prend le délai d'une commande longue, pas le délai standard", () => {
    expect(defaultTimeout("project.detect")).toBe(
      defaultTimeout("project.add")
    );
    expect(defaultTimeout("project.detect")).toBeGreaterThan(
      defaultTimeout("project.restart")
    );
  });

  it("passe par le canal de travail, laissant les lectures libres", async () => {
    const { agent, fake } = client([
      "project-detect-control.jsonl",
      "project-detect-work.jsonl",
    ]);

    await agent.call(SERVER, "snapshot");
    const detected = await agent.call(SERVER, "project.detect", {
      repo: "https://github.com/moi/shop.git",
    });

    expect(detected).toMatchObject({ pkgmgr: "bun", port_hint: 3000 });
    expect(fake.started()).toBe(2);

    agent.closeAll();
  });
});

/**
 * A channel carries one command at a time. A screen that shows nothing while a
 * request waits its turn is the difference between a machine at work and a
 * request that never left, and the caller is the only one who can say it.
 */
describe("une commande qui attend son tour", () => {
  it("le dit à qui l'a demandée, et pas à celle qui part tout de suite", async () => {
    const { agent } = client("snapshot-loop.jsonl");
    const queued: string[] = [];

    const first = agent.call(SERVER, "snapshot", undefined, {
      onQueued: () => queued.push("first"),
    });
    const second = agent.call(SERVER, "snapshot", undefined, {
      onQueued: () => queued.push("second"),
    });

    await Promise.all([first, second]);

    expect(queued).toEqual(["second"]);

    const third = await agent.call(SERVER, "snapshot", undefined, {
      onQueued: () => queued.push("third"),
    });

    expect(third).toBeTruthy();
    expect(queued).toEqual(["second"]);

    agent.closeAll();
  });
});

describe("ce que la fenêtre apprend du lien", () => {
  function watched(): {
    changes: string[];
    onChannel: NonNullable<AgentClientOptions["onChannel"]>;
  } {
    const changes: string[] = [];

    return {
      changes,
      onChannel: (serverId, state) => changes.push(`${serverId} ${state}`),
    };
  }

  it("n'annonce aucune perte pour un canal qui n'a jamais répondu", async () => {
    const seen = watched();
    const agent = createAgentClient({
      spawn: (() =>
        spawnChild("sh", ["-c", "exit 127"], {
          stdio: ["pipe", "pipe", "pipe"],
        })) as never,
      backoff: { firstMs: 1, maxMs: 5, attempts: 2 },
      connectMs: 200,
      onChannel: seen.onChannel,
    });

    const answer = await agent.request(SERVER, "ping");

    expect(answer.ok).toBe(false);
    expect(seen.changes).toEqual([]);

    agent.closeAll();
  });

  it("annonce la perte d'un canal qui, lui, était ouvert", async () => {
    const seen = watched();
    const fake = fakeAgent(["install-cut.jsonl", "install-resume.jsonl"]);
    const agent = createAgentClient({
      spawn: fake.spawn,
      appVersion: "0.1.0",
      backoff: { firstMs: 5, maxMs: 20, attempts: 3 },
      onChannel: seen.onChannel,
    });

    await agent.stream(
      SERVER,
      "install",
      {
        modules: ["db.postgres"],
        config: { "db.postgres": { version: "17" } },
        secrets_stdin: true,
      },
      () => undefined,
      { secrets: { "db.postgres": { app_password: "s3cret-de-test" } } }
    );

    expect(seen.changes).toEqual([
      `${SERVER} open`,
      `${SERVER} lost`,
      `${SERVER} open`,
    ]);

    agent.closeAll();
    fake.killAll();
  });

  it("ne dit pas perdu ce que l'app a fermé elle-même", async () => {
    const seen = watched();
    const fake = fakeAgent("hello-then-ping.jsonl");
    const agent = createAgentClient({
      spawn: fake.spawn,
      appVersion: "0.1.0",
      backoff: { firstMs: 5, maxMs: 20, attempts: 3 },
      onChannel: seen.onChannel,
    });

    await agent.call(SERVER, "ping");
    agent.closeAll();

    expect(await until(() => fake.live() === 0)).toBe(true);
    expect(seen.changes).toEqual([`${SERVER} open`]);

    fake.killAll();
  });
});

describe("un canal qui refuse de s'ouvrir", () => {
  /** `ssh` exits with 255: neither the machine nor the agent was reached. */
  function refusesToOpen(complaint = ""): AgentClientOptions["spawn"] {
    const script = complaint ? `echo '${complaint}' >&2; exit 255` : "exit 255";

    return () =>
      spawnChild("sh", ["-c", script], { stdio: ["pipe", "pipe", "pipe"] });
  }

  it("rend un refus au lieu de tenir l'écran, quel que soit le délai de la commande", async () => {
    const agent = createAgentClient({
      spawn: refusesToOpen(),
      backoff: { firstMs: 60_000, maxMs: 60_000, attempts: 4 },
      connectMs: 300,
    });

    const started = Date.now();
    // `install` grants itself thirty minutes: they count for its execution, never for its connection.
    const answer = await agent.request(SERVER, "install", {
      modules: [],
      config: {},
    } as never);

    expect(answer.ok).toBe(false);
    expect(Date.now() - started).toBeLessThan(5000);

    agent.closeAll();
  });

  it("dit ce que ssh a dit, plutôt que de laisser deviner", async () => {
    const agent = createAgentClient({
      spawn: refusesToOpen("Could not resolve hostname pupitre-srv-mtq9rxgr"),
      backoff: { firstMs: 1, maxMs: 5, attempts: 2 },
      connectMs: 300,
    });

    const answer = await agent.request(SERVER, "enroll", {
      platform_url: "https://app.pupitre.studio/api/v1",
    } as never);

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "disconnected",
        phrase: {
          id: "refusal.agent.dropped.detail",
          values: {
            detail: "Could not resolve hostname pupitre-srv-mtq9rxgr",
          },
        },
      },
    });

    agent.closeAll();
  });
});

describe("le serveur d'un canal", () => {
  /**
   * A channel belongs to its machine and no other.
   *
   * Falling back to another one — the active machine, say — would run on it
   * what was meant for the one that disappeared. No convenience buys back that
   * kind of substitution.
   */
  it("ne se rabat sur aucune autre quand elle est inconnue", async () => {
    const agent = createAgentClient({
      spawn: sshSpawn((serverId) => {
        if (serverId === "connu") {
          return { args: ["-F", "/tmp/config", "pupitre-connu"] };
        }

        return null;
      }),
      backoff: { firstMs: 1, maxMs: 5, attempts: 3 },
      connectMs: 200,
    });

    const answer = await agent.request("disparu", "ping");

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "bad_request",
        phrase: { id: "refusal.server.unknown" },
      },
    });
    agent.closeAll();
  });
});

describe("un ssh qui meurt vite", () => {
  /**
   * `exit` arrives before stderr is handed over.
   *
   * Node reports the process ending as soon as it stops, but the streams are
   * only flushed at `close`. Keying on `exit` lost `ssh`'s complaint when it
   * arrived a few milliseconds too late — and the screen had nothing but an
   * exit code to show.
   */
  function dyingProcess(): { child: EventEmitter; stderr: EventEmitter } {
    const stderr = new EventEmitter() as EventEmitter & {
      setEncoding: () => void;
    };
    stderr.setEncoding = () => undefined;

    const stdout = new EventEmitter() as EventEmitter & {
      setEncoding: () => void;
    };
    stdout.setEncoding = () => undefined;

    const child = Object.assign(new EventEmitter(), {
      exitCode: null as number | null,
      kill: () => undefined,
      stderr,
      stdin: { write: () => true },
      stdout,
    });

    return { child, stderr };
  }

  it("dit quand même ce qu'il avait à dire", async () => {
    const dying = dyingProcess();
    const agent = createAgentClient({
      spawn: (() => {
        queueMicrotask(() => {
          (dying.child as unknown as { exitCode: number }).exitCode = 255;
          dying.child.emit("exit", 255);
          dying.stderr.emit(
            "data",
            "ssh: connect to host 192.168.100.228 port 2222: Operation timed out\n"
          );
          dying.child.emit("close", 255);
        });

        return dying.child;
      }) as never,
      backoff: { firstMs: 1, maxMs: 2, attempts: 1 },
      connectMs: 200,
    });

    const answer = await agent.request(SERVER, "ping");

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "disconnected",
        phrase: { id: "refusal.agent.dropped.detail" },
      },
    });
    expect(answer.ok ? "" : answer.error.phrase?.values?.detail).toContain(
      "Operation timed out"
    );

    agent.closeAll();
  });
});
