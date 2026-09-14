import { describe, expect, it } from "bun:test";
import { type ChildProcess, spawn as spawnChild } from "node:child_process";
import { EventEmitter } from "node:events";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import {
  AgentCallError,
  type AgentClient,
  type AgentClientOptions,
  createAgentClient,
  defaultTimeout,
  serveAs,
  sshSpawn,
} from "../agent-client";
import { enableTrace, type TraceEntry, tracesTo } from "../trace";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

/** The transcripts stamp their reports on this day: the client's clock has to agree. */
const TODAY = Date.parse("2026-09-04T12:00:00Z");

function client(
  fixtures: string | string[],
  options: Partial<Parameters<typeof createAgentClient>[0]> = {}
): { agent: AgentClient; fake: FakeAgent } {
  const fake = fakeAgent(fixtures);
  const agent = createAgentClient({
    spawn: fake.spawn,
    appVersion: "0.1.0",
    backoff: { firstMs: 5, maxMs: 20, attempts: 3 },
    now: () => TODAY,
    pollMs: 5,
    ...options,
  });

  return { agent, fake };
}

const INSTALL_PARAMS = {
  modules: ["db.postgres"],
  config: { "db.postgres": { version: "17" } },
  secrets_stdin: true,
};

const INSTALL_SECRETS = {
  secrets: { "db.postgres": { app_password: "s3cret-de-test" } },
};

function install(
  agent: AgentClient,
  steps: string[] = [],
  timeoutMs?: number
): Promise<InstallResult | AgentCallError> {
  return agent
    .stream(
      SERVER,
      "install",
      INSTALL_PARAMS,
      (event: Event) => {
        steps.push(
          `${String(event.module)} ${String(event.step)} ${String(event.status)}`
        );
      },
      { ...INSTALL_SECRETS, ...(timeoutMs ? { timeoutMs } : {}) }
    )
    .then(
      (result) => result as InstallResult,
      (error: AgentCallError) => error
    );
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
      protocol: 2,
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

  it("suit le rapport tant que la machine travaille encore", async () => {
    const { agent, fake } = client([
      "install-cut.jsonl",
      "install-resume-running.jsonl",
    ]);

    const steps: string[] = [];
    const result = await install(agent, steps);

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
    expect(fake.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=install",
      "id=3 cmd=hello",
      "id=4 cmd=report",
      "id=5 cmd=report",
    ]);

    agent.closeAll();
  });

  it("rouvre le canal autant de fois qu'il retombe pendant la relecture", async () => {
    const { agent, fake } = client([
      "install-cut.jsonl",
      "install-resume-cut-again.jsonl",
      "install-resume.jsonl",
    ]);

    const steps: string[] = [];
    const result = await install(agent, steps);

    expect(steps).toEqual([
      "db.postgres apt start",
      "db.postgres apt ok",
      "db.postgres cluster start",
      "db.postgres cluster ok",
    ]);
    expect(result).toMatchObject({ warned: ["db.postgres"] });
    expect(fake.started()).toBe(3);
    expect(fake.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=install",
      "id=3 cmd=hello",
      "id=4 cmd=report",
      "id=5 cmd=hello",
      "id=6 cmd=report",
    ]);

    agent.closeAll();
  });

  it("insiste au-delà de la fenêtre de connexion tant que la commande a du temps", async () => {
    const { agent, fake } = client(
      [
        "install-cut.jsonl",
        "dies-at-hello.jsonl",
        "dies-at-hello.jsonl",
        "dies-at-hello.jsonl",
        "dies-at-hello.jsonl",
        "install-resume.jsonl",
      ],
      { backoff: { firstMs: 1, maxMs: 5, attempts: 2 }, connectMs: 200 }
    );

    const result = await install(agent, [], 10_000);

    expect(result).toMatchObject({ warned: ["db.postgres"] });
    expect(fake.started()).toBe(6);

    agent.closeAll();
  });

  it("renonce à l'échéance de la commande, avec ce que ssh a dit en dernier", async () => {
    const { agent } = client(["install-cut.jsonl", "dies-at-hello.jsonl"], {
      backoff: { firstMs: 1, maxMs: 5, attempts: 2 },
      connectMs: 500,
    });

    const started = Date.now();
    const result = await install(agent, [], 1500);

    expect(result).toBeInstanceOf(AgentCallError);
    expect((result as AgentCallError).code).toBe("disconnected");
    expect(Date.now() - started).toBeLessThan(5000);

    agent.closeAll();
  });

  it("ne prend pas le rapport d'une installation d'avant pour le sien", async () => {
    const { agent, fake } = client([
      "install-cut.jsonl",
      "install-resume-stale.jsonl",
    ]);

    const result = await install(agent);

    expect(result).toBeInstanceOf(AgentCallError);
    expect((result as AgentCallError).code).toBe("disconnected");
    expect(fake.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=install",
      "id=3 cmd=hello",
      "id=4 cmd=report",
    ]);

    agent.closeAll();
  });

  it("ne rouvre pas un canal que l'app a fermé elle-même", async () => {
    const { agent, fake } = client("install-hangs.jsonl");

    const pending = install(agent);
    await until(() => fake.trace().includes("id=2 cmd=install"));
    agent.close(SERVER);

    const result = await pending;

    expect(result).toBeInstanceOf(AgentCallError);
    expect((result as AgentCallError).phrase?.id).toBe(
      "refusal.channel.closed"
    );
    expect(fake.started()).toBe(1);

    fake.killAll();
  });

  it("remonte protocol_mismatch et ne rouvre pas le canal", async () => {
    const { agent, fake } = client("protocol-mismatch.jsonl");

    const first = await agent.call(SERVER, "snapshot").catch((e) => e);
    const second = await agent.call(SERVER, "snapshot").catch((e) => e);

    expect(first).toBeInstanceOf(AgentCallError);
    expect(first.code).toBe("protocol_mismatch");
    expect(first.fix).toBe("Mets à jour l'app jusqu'au protocole 3.");
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
          "protocole 2 non pris en charge : cet agent parle le protocole 3",
        fix: "Mets à jour l'app jusqu'au protocole 3.",
      },
    });

    agent.closeAll();
  });
});

/**
 * A followed journal holds its channel until the reader leaves, not until the
 * agent answers: the service panel shows the journal and the configuration
 * form side by side, and applying the form must not wait for the reader to
 * close the panel.
 */
describe("un journal suivi", () => {
  it("laisse partir un install sans attendre que le lecteur s'en aille", async () => {
    const { agent, fake } = client([
      "service-logs-follow-held.jsonl",
      "install-secrets.jsonl",
    ]);
    const queued: string[] = [];
    const lines: string[] = [];
    const reader = new AbortController();

    const journal = agent
      .stream(
        SERVER,
        "service.logs",
        { follow: true, id: "db.postgres", lines: 120 },
        (event: Event) => lines.push(String(event.line)),
        { onQueued: () => queued.push("service.logs"), signal: reader.signal }
      )
      .catch((error: AgentCallError) => error);

    expect(await until(() => lines.length === 1)).toBe(true);

    const steps: string[] = [];
    const result = await agent.stream(
      SERVER,
      "install",
      INSTALL_PARAMS,
      (event: Event) => steps.push(String(event.step)),
      { ...INSTALL_SECRETS, onQueued: () => queued.push("install") }
    );

    expect(queued).toEqual([]);
    expect(steps).toEqual(["apt", "apt", "cluster", "cluster"]);
    expect(result).toMatchObject({ failed: [] });
    expect(fake.started()).toBe(2);

    reader.abort();
    await journal;
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

    expect(detected).toMatchObject({
      processes: [{ pkgmgr: "bun", port_hint: 3000 }],
    });
    expect(fake.started()).toBe(2);

    agent.closeAll();
  });
});

/**
 * The dashboard reads the machine on a timer, and that read holds a channel
 * for most of a second: a folder clicked meanwhile must not sit behind it.
 */
describe("une lecture sur minuterie", () => {
  it("passe par le canal du battement, laissant un geste partir tout de suite", async () => {
    const { agent, fake } = client([
      "snapshot-loop.jsonl",
      "hello-then-ping.jsonl",
    ]);
    const queued: string[] = [];

    const beat = agent.call(SERVER, "snapshot", undefined, {
      onQueued: () => queued.push("snapshot"),
      polled: true,
    });
    const gesture = agent.call(SERVER, "ping", undefined, {
      onQueued: () => queued.push("ping"),
    });

    await Promise.all([beat, gesture]);

    expect(queued).toEqual([]);
    expect(fake.started()).toBe(2);
    // Each channel numbers from one: neither command waited for the other's hello.
    expect(fake.trace().sort()).toEqual([
      "id=1 cmd=hello",
      "id=1 cmd=hello",
      "id=2 cmd=ping",
      "id=2 cmd=snapshot",
    ]);

    agent.closeAll();
  });

  it("suffit à dire ce que hello a répondu, avant tout geste", async () => {
    const { agent, fake } = client("snapshot-loop.jsonl");

    expect(agent.session(SERVER)).toBeNull();

    await agent.call(SERVER, "snapshot", undefined, { polled: true });

    expect(agent.session(SERVER)?.agent_version).toBe("0.0.0-test");
    expect(fake.started()).toBe(1);

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
      now: () => TODAY,
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

describe("la commande serve selon le compte", () => {
  /**
   * `pupitred serve` is a root process. Once hardening has closed root, the app
   * logs in as dev, where a bare serve reads neither the token nor the
   * entitlement cache — both 0600 root — and answers entitlement_required for
   * every command. dev holds passwordless sudo, so the channel asks for it.
   */
  it("passe par sudo pour un compte non-root", () => {
    expect(serveAs("dev")).toBe("sudo -n pupitred serve");
    expect(serveAs("deploy")).toBe("sudo -n pupitred serve");
  });

  it("n'ajoute pas sudo pour root, qui n'en a pas besoin", () => {
    expect(serveAs("root")).toBe("pupitred serve");
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
      stdin: Object.assign(new EventEmitter(), { write: () => true }),
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

/**
 * A process standing in for `ssh`: the test decides what it writes and when.
 *
 * `written` is what the app sent it, line by line; `say` answers on its output,
 * `die` ends it. Nothing here is a transcript, which is the point — these are
 * the shapes no transcript can replay: silence, floods, a broken pipe.
 */
function scripted(): {
  child: ChildProcess;
  written: string[];
  say: (line: string) => void;
  write: (chunk: string) => void;
  die: () => void;
  stdin: EventEmitter;
  killed: () => boolean;
} {
  const written: string[] = [];
  let killed = false;

  const stream = () => {
    const emitter = new EventEmitter() as EventEmitter & {
      setEncoding: () => void;
    };
    emitter.setEncoding = () => undefined;

    return emitter;
  };

  const stdout = stream();
  const stderr = stream();
  const stdin = Object.assign(new EventEmitter(), {
    write: (chunk: string) => {
      written.push(chunk.trim());

      return true;
    },
  });

  const child = Object.assign(new EventEmitter(), {
    exitCode: null as number | null,
    kill: () => {
      killed = true;
      child.exitCode = 137;
      child.emit("close", 137);

      return true;
    },
    stderr,
    stdin,
    stdout,
  });

  return {
    child: child as unknown as ChildProcess,
    die: () => {
      child.exitCode = 255;
      child.emit("exit", 255);
      child.emit("close", 255);
    },
    killed: () => killed,
    say: (line) => stdout.emit("data", `${line}\n`),
    stdin,
    write: (chunk) => stdout.emit("data", chunk),
    written,
  };
}

const GREETING = JSON.stringify({
  id: 1,
  ok: true,
  result: {
    agent_version: "0.0.0-test",
    protocol: 2,
    entitlement: "dev",
    capabilities: ["hello", "ping", "snapshot", "project.logs"],
  },
});

function scriptedClient(options: Partial<AgentClientOptions> = {}): {
  agent: AgentClient;
  ssh: ReturnType<typeof scripted>;
} {
  const ssh = scripted();
  const agent = createAgentClient({
    spawn: () => ssh.child,
    backoff: { firstMs: 1, maxMs: 2, attempts: 1 },
    connectMs: 200,
    ...options,
  });

  return { agent, ssh };
}

async function untilWritten(
  ssh: ReturnType<typeof scripted>,
  count: number
): Promise<void> {
  expect(await until(() => ssh.written.length >= count)).toBe(true);
}

describe("le message d'une étape", () => {
  it("traverse en direct, tel que l'agent l'a écrit", async () => {
    const { agent } = client("install-fail-message.jsonl");
    const failed: Event[] = [];

    await agent.stream(
      SERVER,
      "install",
      {
        modules: ["db.mysql"],
        config: { "db.mysql": {} },
        secrets_stdin: false,
      },
      (event) => {
        if (event.status === "fail") {
          failed.push(event);
        }
      }
    );

    expect(failed).toHaveLength(1);
    expect(failed[0]?.message).toBe("E: Unable to locate package mysql-server");

    agent.closeAll();
  });

  it("survit au rejeu depuis le rapport, après une coupure", async () => {
    const { agent } = client([
      "install-fail-message-cut.jsonl",
      "install-fail-message-resume.jsonl",
    ]);
    const seen: string[] = [];

    const result = (await agent.stream(
      SERVER,
      "install",
      {
        modules: ["db.mysql"],
        config: { "db.mysql": {} },
        secrets_stdin: false,
      },
      (event) => {
        seen.push(
          `${String(event.step)} ${String(event.status)} ${String(event.message ?? "")}`.trim()
        );
      }
    )) as InstallResult;

    expect(result.failed).toEqual(["db.mysql"]);
    expect(seen).toEqual([
      "apt start",
      "apt fail E: Unable to locate package mysql-server",
    ]);

    agent.closeAll();
  });
});

describe("les capacités de l'agent", () => {
  it("refusent une commande que le hello n'a pas déclarée, sans l'envoyer", async () => {
    const { agent, fake } = client("hello-reduced.jsonl", {
      appVersion: "0.1.0",
    });

    expect((await agent.call(SERVER, "ping")).ts).toBe("2026-09-04T12:00:00Z");

    const answer = await agent.request(SERVER, "snapshot");

    expect(answer).toMatchObject({
      ok: false,
      error: {
        code: "unknown_command",
        phrase: {
          id: "refusal.capability.missing",
          values: { agent: "0.0.0-test", cmd: "snapshot", floor: "0.1.0" },
        },
      },
    });
    expect(fake.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=ping"]);

    agent.closeAll();
  });
});

describe("la robustesse du canal", () => {
  it("compte le délai du hello depuis le premier octet, pas depuis le spawn", async () => {
    const { agent, ssh } = scriptedClient({
      connectMs: 1000,
      timeouts: { hello: 40 },
    });

    const answer = agent.request(SERVER, "ping");

    await untilWritten(ssh, 1);
    await delay(120);
    ssh.say(GREETING);
    await untilWritten(ssh, 2);
    ssh.say(JSON.stringify({ id: 2, ok: true, result: { ts: "now" } }));

    expect(await answer).toEqual({ ok: true, result: { ts: "now" } });

    agent.closeAll();
  });

  it("borne quand même un ssh qui ne dit jamais rien", async () => {
    const { agent } = scriptedClient({
      connectMs: 60,
      timeouts: { hello: 60_000 },
    });

    const started = Date.now();
    const answer = await agent.request(SERVER, "ping");

    expect(answer).toMatchObject({ ok: false, error: { code: "timeout" } });
    expect(Date.now() - started).toBeLessThan(2000);

    agent.closeAll();
  });

  it("rend un refus quand le tuyau casse, plutôt que de tuer le processus", async () => {
    const { agent, ssh } = scriptedClient();

    const answer = agent.request(SERVER, "ping");

    await untilWritten(ssh, 1);
    ssh.stdin.emit("error", new Error("write EPIPE"));

    expect(await answer).toMatchObject({
      ok: false,
      error: {
        code: "disconnected",
        phrase: {
          id: "refusal.agent.dropped.detail",
          values: { detail: "write EPIPE" },
        },
      },
    });

    agent.closeAll();
  });

  it("coupe un canal qui déverse sans jamais finir sa ligne", async () => {
    const { agent, ssh } = scriptedClient();

    const answer = agent.request(SERVER, "ping");

    await untilWritten(ssh, 1);
    ssh.write("x".repeat(3 * 1024 * 1024));
    ssh.write("x".repeat(2 * 1024 * 1024));

    expect(await answer).toMatchObject({
      ok: false,
      error: {
        code: "disconnected",
        phrase: { id: "refusal.channel.flooded", values: { limit: 4 } },
      },
    });
    expect(ssh.killed()).toBe(true);

    agent.closeAll();
  });

  it("se laisse annuler par qui a lancé la commande, et coupe l'agent", async () => {
    const { agent, ssh } = scriptedClient();
    const control = new AbortController();

    const answer = agent.request(
      SERVER,
      "project.logs",
      { follow: true, lines: 10, name: "web", process: "web" },
      { signal: control.signal }
    );

    await untilWritten(ssh, 1);
    ssh.say(GREETING);
    await untilWritten(ssh, 2);
    control.abort();

    expect(await answer).toMatchObject({
      ok: false,
      error: {
        code: "cancelled",
        phrase: {
          id: "refusal.command.cancelled",
          values: { cmd: "project.logs" },
        },
      },
    });
    expect(ssh.killed()).toBe(true);

    agent.closeAll();
  });

  it("ne part même pas quand le signal est déjà levé", async () => {
    const { agent, ssh } = scriptedClient();
    const control = new AbortController();

    control.abort();

    const answer = await agent.request(SERVER, "ping", undefined, {
      signal: control.signal,
    });

    expect(answer).toMatchObject({ ok: false, error: { code: "cancelled" } });
    expect(ssh.written).toEqual([]);

    agent.closeAll();
  });

  it("ne part pas non plus quand le signal est levé pendant que le canal s'ouvre", async () => {
    const { agent, ssh } = scriptedClient();
    const control = new AbortController();

    const answer = agent.request(
      SERVER,
      "project.logs",
      { follow: true, lines: 10, name: "web", process: "web" },
      { signal: control.signal }
    );

    await untilWritten(ssh, 1);
    control.abort();
    ssh.say(GREETING);

    expect(await answer).toMatchObject({
      ok: false,
      error: { code: "cancelled" },
    });
    expect(ssh.written).toHaveLength(1);

    const next = agent.request(SERVER, "project.logs", {
      follow: false,
      lines: 10,
      name: "web",
      process: "web",
    });

    await untilWritten(ssh, 2);
    expect(JSON.parse(ssh.written[1] ?? "")).toMatchObject({
      cmd: "project.logs",
      id: 2,
    });
    ssh.say(JSON.stringify({ id: 2, ok: true, result: { lines: [] } }));

    expect(await next).toMatchObject({ ok: true, result: { lines: [] } });

    agent.closeAll();
  });
});

describe("la forme des réponses, en développement", () => {
  it("trace un résultat que le contrat ne décrit pas, sans faire échouer l'appel", async () => {
    const entries: TraceEntry[] = [];
    const { agent, ssh } = scriptedClient({ validateResults: true });

    enableTrace(true);
    tracesTo((entry) => entries.push(entry));

    try {
      const answer = agent.request(SERVER, "ping");

      await untilWritten(ssh, 1);
      ssh.say(GREETING);
      await untilWritten(ssh, 2);
      ssh.say(JSON.stringify({ id: 2, ok: true, result: { when: "now" } }));

      expect(await answer).toEqual({
        ok: true,
        result: { when: "now" },
      } as never);
      expect(
        entries.find((entry) => entry.event === "ping.shape")?.detail?.issues
      ).toEqual(["ts: Invalid input: expected string, received undefined"]);
    } finally {
      enableTrace(false);
      tracesTo(null);
    }

    agent.closeAll();
  });
});
