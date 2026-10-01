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
  privilegedServeAs,
  reportOfRun,
  SUDO_PROMPT,
  serveAs,
  sshSpawn,
} from "../agent-client";
import { enableTrace, type TraceEntry, tracesTo } from "../trace";
import { type EchoAgent, echoAgent } from "./fixtures/echo-agent";
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

describe("the channel", () => {
  it("says hello on its own, then replays the transcript", async () => {
    const { agent, fake } = client("hello-then-ping.jsonl");

    const ping = await agent.call(SERVER, "ping");

    expect(ping.ts).toBe("2026-09-04T12:00:00Z");
    expect(agent.session(SERVER)).toMatchObject({
      agent_version: "0.0.0-test",
      protocol: 3,
      license: "dev",
    });
    expect(agent.capabilities(SERVER)).toContain("snapshot");
    expect(fake.trace()[0]).toBe("id=1 cmd=hello");

    agent.closeAll();
  });

  it("chains a hundred snapshots on a single process, with no gap in the ids", async () => {
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

  it("resumes the event stream after a drop, backed by the report", async () => {
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

  it("reports the drop, not the missing report, when the agent wrote none", async () => {
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

  it("follows the report while the machine is still working", async () => {
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

  it("reopens the channel as many times as it drops during the re-read", async () => {
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
      "id=5 cmd=report",
      "id=6 cmd=hello",
      "id=7 cmd=report",
    ]);

    agent.closeAll();
  });

  it("keeps trying past the connection window while the command has time", async () => {
    const { agent, fake } = client(
      [
        "install-cut.jsonl",
        "dies-at-hello.jsonl",
        "dies-at-hello.jsonl",
        "dies-at-hello.jsonl",
        "dies-at-hello.jsonl",
        "install-resume.jsonl",
      ],
      { backoff: { firstMs: 1, maxMs: 5, attempts: 2 }, connectMs: 2000 }
    );

    const result = await install(agent, [], 10_000);

    expect(result).toMatchObject({ warned: ["db.postgres"] });
    expect(fake.started()).toBe(6);

    agent.closeAll();
  });

  // A loaded two-core runner can take more than half a second to answer hello, and the wait outlasts bun's 5 s default.
  it("gives up at the command deadline, with what ssh said last", async () => {
    const { agent } = client(["install-cut.jsonl", "dies-at-hello.jsonl"], {
      backoff: { firstMs: 1, maxMs: 5, attempts: 2 },
      connectMs: 1500,
    });

    const started = Date.now();
    const result = await install(agent, [], 2500);

    expect(result).toBeInstanceOf(AgentCallError);
    expect((result as AgentCallError).code).toBe("disconnected");
    expect(Date.now() - started).toBeLessThan(7000);

    agent.closeAll();
  }, 15_000);

  it("does not take the report of an earlier installation for its own", async () => {
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

  // The previous run's report stays on the machine until this run's configuration is validated.
  it("refuses a report that finished a few minutes before the request", async () => {
    const { agent, fake } = client([
      "install-cut.jsonl",
      "install-resume-earlier.jsonl",
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

  it("accepts a report the machine's clock dates slightly earlier", async () => {
    const { agent } = client([
      "install-cut.jsonl",
      "install-resume-close.jsonl",
    ]);

    const result = await install(agent);

    expect(result).toEqual({
      failed: [],
      warned: ["db.postgres"],
      report_path: "/var/lib/pupitre/report.json",
    });

    agent.closeAll();
  });

  it("does not reopen a channel the app closed itself", async () => {
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

  it("surfaces protocol_mismatch and does not reopen the channel", async () => {
    const { agent, fake } = client("protocol-mismatch.jsonl");

    const first = await agent.call(SERVER, "snapshot").catch((e) => e);
    const second = await agent.call(SERVER, "snapshot").catch((e) => e);

    expect(first).toBeInstanceOf(AgentCallError);
    expect(first.code).toBe("protocol_mismatch");
    expect(first.fix).toBe("Mets à jour l'agent jusqu'au protocole 3.");
    expect(second.code).toBe("protocol_mismatch");
    expect(fake.started()).toBe(1);

    agent.closeAll();
  });

  // The agent handles one request at a time: a command still running would make the next one time out too.
  it("cuts the session on a timeout, and the next one starts on a fresh session", async () => {
    const { agent, fake } = client(
      ["snapshot-timeout.jsonl", "snapshot-loop.jsonl"],
      { timeouts: { snapshot: 200 } }
    );

    const timedOut = await agent.call(SERVER, "snapshot").catch((e) => e);

    expect(timedOut).toBeInstanceOf(AgentCallError);
    expect(timedOut.code).toBe("timeout");
    expect(agent.session(SERVER)).toBeNull();
    expect(await until(() => fake.live() === 0)).toBe(true);

    const after = await agent.call(SERVER, "snapshot");

    expect(after.machine.hostname).toBe("staging");
    expect(fake.started()).toBe(2);
    expect(fake.trace()).toEqual([
      "id=1 cmd=hello",
      "id=2 cmd=snapshot",
      "id=3 cmd=hello",
      "id=4 cmd=snapshot",
    ]);

    agent.closeAll();
  });

  it("no longer answers for a channel whose process is dead", async () => {
    const { agent, fake } = client("hello-then-ping.jsonl");

    await agent.call(SERVER, "ping");
    expect(agent.session(SERVER)).not.toBeNull();

    fake.killAll();

    expect(await until(() => agent.session(SERVER) === null)).toBe(true);

    agent.closeAll();
  });

  it("counts a server's closures, for what is read again afterwards", async () => {
    const { agent } = client("hello-then-ping.jsonl");

    expect(agent.epoch(SERVER)).toBe(0);

    await agent.call(SERVER, "ping");
    agent.close(SERVER);

    expect(agent.epoch(SERVER)).toBe(1);
    expect(agent.epoch("autre")).toBe(0);

    await agent.call(SERVER, "ping");
    agent.closeAll();

    expect(agent.epoch(SERVER)).toBe(2);
  });

  it("installs with its secrets line, without a secret coming back out", async () => {
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

  it("gives the protocol envelope to what crosses the IPC", async () => {
    const { agent } = client("protocol-mismatch.jsonl");

    const response = await agent.request(SERVER, "snapshot");

    expect(response).toEqual({
      ok: false,
      error: {
        code: "protocol_mismatch",
        message:
          "protocole 3 non pris en charge : cet agent parle le protocole 2",
        fix: "Mets à jour l'agent jusqu'au protocole 3.",
      },
    });

    agent.closeAll();
  });
});

// A followed journal holds its channel until the reader leaves, while the form beside it must still apply.
describe("a followed journal", () => {
  it("lets an install go without waiting for the reader to leave", async () => {
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

// The agent has no cancel yet: a dropped follow is killed with its channel, and only that channel pays.
describe("a cancelled follow", () => {
  it("restarts on a fresh process, without the control channel paying for the reconnection", async () => {
    const { agent, fake } = client([
      "ping-loop.jsonl",
      "service-logs-follow-held.jsonl",
      "service-logs-follow-held.jsonl",
    ]);
    const queued: string[] = [];

    await agent.call(SERVER, "ping");

    const first = new AbortController();
    const lines: string[] = [];
    const journal = agent
      .stream(
        SERVER,
        "service.logs",
        { follow: true, id: "db.postgres", lines: 120 },
        (event: Event) => lines.push(String(event.line)),
        { signal: first.signal }
      )
      .catch((error: AgentCallError) => error);

    expect(await until(() => lines.length === 1)).toBe(true);

    first.abort();

    expect((await journal) as AgentCallError).toMatchObject({
      code: "cancelled",
    });
    expect(await until(() => fake.live() === 1)).toBe(true);

    const second = new AbortController();
    const again = agent
      .stream(
        SERVER,
        "service.logs",
        { follow: true, id: "db.postgres", lines: 120 },
        (event: Event) => lines.push(String(event.line)),
        { onQueued: () => queued.push("service.logs"), signal: second.signal }
      )
      .catch((error: AgentCallError) => error);

    expect(await until(() => lines.length === 2)).toBe(true);

    await agent.call(SERVER, "ping", undefined, {
      onQueued: () => queued.push("ping"),
    });

    expect(queued).toEqual([]);
    expect(fake.started()).toBe(3);
    expect(fake.live()).toBe(2);
    expect(fake.trace().filter((line) => line.includes("hello"))).toHaveLength(
      3
    );

    second.abort();
    await again;
    agent.closeAll();
  });
});

describe("a run's report", () => {
  const SENT_AT = Date.parse("2026-09-04T12:00:00Z");
  const SKEW_MS = 60_000;

  function report(started_at: string, finished_at: string) {
    return {
      agent_version: "0.0.0-test",
      failed: [],
      finished_at,
      modules: [],
      report_path: "/var/lib/pupitre/report.json",
      started_at,
      warned: [],
    };
  }

  it("is its own when it starts within the clock tolerance", () => {
    expect(
      reportOfRun(
        report("2026-09-04T11:59:30Z", "2026-09-04T12:02:00Z"),
        SENT_AT,
        SKEW_MS
      )
    ).toBe(true);
    expect(
      reportOfRun(report("2026-09-04T12:00:05Z", ""), SENT_AT, SKEW_MS)
    ).toBe(true);
  });

  it("belongs to another run when it started before", () => {
    expect(
      reportOfRun(
        report("2026-09-04T11:58:00Z", "2026-09-04T12:01:00Z"),
        SENT_AT,
        SKEW_MS
      )
    ).toBe(false);
  });

  it("belongs to another run when it finished before, whatever its start says", () => {
    expect(
      reportOfRun(report("", "2026-09-04T11:58:00Z"), SENT_AT, SKEW_MS)
    ).toBe(false);
  });
});

describe("project detection", () => {
  it("takes a long command's timeout, not the standard one", () => {
    expect(defaultTimeout("project.detect")).toBe(
      defaultTimeout("project.add")
    );
    expect(defaultTimeout("project.detect")).toBeGreaterThan(
      defaultTimeout("project.restart")
    );
  });

  it("goes through the work channel, leaving reads free", async () => {
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

// A timer read holds its channel for most of a second: a gesture meanwhile must not sit behind it.
describe("a timer read", () => {
  it("goes through the beat channel, letting a gesture leave right away", async () => {
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

  it("is enough to tell what hello answered, before any gesture", async () => {
    const { agent, fake } = client("snapshot-loop.jsonl");

    expect(agent.session(SERVER)).toBeNull();

    await agent.call(SERVER, "snapshot", undefined, { polled: true });

    expect(agent.session(SERVER)?.agent_version).toBe("0.0.0-test");
    expect(fake.started()).toBe(1);

    agent.closeAll();
  });
});

describe("a command waiting its turn", () => {
  it("tells whoever asked for it, and not the one that leaves right away", async () => {
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

describe("what the window learns about the link", () => {
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

  it("announces no loss for a channel that never answered", async () => {
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

  it("announces the loss of a channel that was open", async () => {
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

  it("does not report as lost what the app closed itself", async () => {
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

describe("a channel that refuses to open", () => {
  /** `ssh` exits with 255: neither the machine nor the agent was reached. */
  function refusesToOpen(complaint = ""): AgentClientOptions["spawn"] {
    const script = complaint ? `echo '${complaint}' >&2; exit 255` : "exit 255";

    return () =>
      spawnChild("sh", ["-c", script], { stdio: ["pipe", "pipe", "pipe"] });
  }

  it("returns a refusal instead of holding the screen, whatever the command timeout", async () => {
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

  it("says what ssh said, rather than leaving it to guesswork", async () => {
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

describe("the serve command by account", () => {
  // As dev, a bare serve cannot read the 0600 root token and answers license_required to everything.
  it("goes through sudo for a non-root account", () => {
    expect(serveAs("dev")).toBe("sudo -n pupitred serve");
    expect(serveAs("deploy")).toBe("sudo -n pupitred serve");
  });

  it("does not add sudo for root, which does not need it", () => {
    expect(serveAs("root")).toBe("pupitred serve");
  });

  it("opens the privileged session directly as root", () => {
    expect(privilegedServeAs("root")).toBe("pupitred serve --privileged");
  });

  // Under a passwordless sudo rule the password line would reach pupitred as a request.
  it("has sudo read the password, and the shell when sudo does not want it", () => {
    const command = privilegedServeAs("dev");

    expect(command).toContain("sudo -n true");
    expect(command).toContain("sudo -n pupitred serve --privileged");
    expect(command).toContain(
      `sudo -S -p '${SUDO_PROMPT}' pupitred serve --privileged`
    );
    expect(command.indexOf("read -r")).toBeLessThan(
      command.indexOf("sudo -n pupitred serve --privileged")
    );
  });
});

describe("the privileged channel", () => {
  function echoClient(options: Partial<AgentClientOptions> = {}): {
    agent: AgentClient;
    echo: EchoAgent;
  } {
    const echo = echoAgent();
    const agent = createAgentClient({
      spawn: echo.spawn,
      backoff: { firstMs: 1, maxMs: 2, attempts: 1 },
      connectMs: 200,
      ...options,
    });

    return { agent, echo };
  }

  it("carries what the contract reserves for --privileged, and the rest on the passwordless channels", async () => {
    const { agent, echo } = echoClient();

    await agent.call(SERVER, "snapshot", undefined, { polled: true });
    await agent.call(SERVER, "project.up", { name: "web" });
    await agent.call(SERVER, "service.secret", {
      id: "db.mysql",
      key: "MYSQL_APP_PASSWORD",
    });
    await agent.call(SERVER, "install", {
      config: {},
      modules: ["db.mysql"],
      secrets_stdin: true,
    });
    await agent.call(SERVER, "agent.upgrade", { version: "1.2.0" });
    await agent.call(SERVER, "agent.upgrade", {
      allow_downgrade: true,
      version: "1.1.0",
    });

    expect(echo.routed().filter((line) => !line.endsWith(" hello"))).toEqual([
      "beat snapshot",
      "control project.up",
      "privileged service.secret",
      "privileged install",
      "work agent.upgrade",
      "privileged agent.upgrade",
    ]);

    agent.closeAll();
  });

  it("runs a read gesture on the privileged channel when the caller asks", async () => {
    const { agent, echo } = echoClient();

    await agent.call(SERVER, "ping", undefined, { privileged: true });

    expect(echo.routed()).toEqual(["privileged hello", "privileged ping"]);

    agent.closeAll();
  });

  it("closes once idle, without announcing a drop, and reopens on the next gesture", async () => {
    const changes: string[] = [];
    const { agent, echo } = echoClient({
      idleMs: 20,
      onChannel: (_server, state) => changes.push(state),
    });

    await agent.call(SERVER, "reboot");
    expect(await until(() => echo.killed() === 1)).toBe(true);

    await agent.call(SERVER, "reboot");

    expect(echo.started()).toBe(2);
    expect(changes).toEqual(["open", "open"]);

    agent.closeAll();
  });

  it("does not close while the passwordless session stays open beside it", async () => {
    const { agent, echo } = echoClient({ idleMs: 20 });

    await agent.call(SERVER, "snapshot");
    await delay(60);

    expect(echo.killed()).toBe(0);

    agent.closeAll();
  });

  // A second sudo prompt means the password was refused and the hello is being read as the next attempt.
  it("cuts at the second sudo prompt and says so, without replaying the same password", async () => {
    const opened: ReturnType<typeof scripted>[] = [];
    const agent = createAgentClient({
      spawn: () => {
        const ssh = scripted();
        opened.push(ssh);

        return ssh.child;
      },
      backoff: { firstMs: 1, maxMs: 2, attempts: 3 },
      connectMs: 500,
      sudoHeld: () => true,
    });

    const answer = agent.request(SERVER, "reboot");

    expect(await until(() => opened.length === 1)).toBe(true);
    const [ssh] = opened;
    ssh?.child.stderr?.emit("data", SUDO_PROMPT);
    ssh?.child.stderr?.emit("data", `Sorry, try again.\n${SUDO_PROMPT}`);

    expect(await answer).toMatchObject({
      ok: false,
      error: {
        code: "privilege_required",
        phrase: { id: "refusal.sudo.refused" },
      },
    });
    expect(ssh?.killed()).toBe(true);

    expect(await agent.request(SERVER, "reboot")).toMatchObject({
      ok: false,
      error: { phrase: { id: "refusal.sudo.refused" } },
    });
    expect(opened.length).toBe(1);

    agent.resetPrivileged(SERVER);
    agent.request(SERVER, "reboot");
    expect(await until(() => opened.length === 2)).toBe(true);

    agent.closeAll();
  });

  it("says this computer does not hold the password when it had none", async () => {
    const { agent, ssh } = scriptedClient({ sudoHeld: () => false });

    const answer = agent.request(SERVER, "reboot");

    await until(() => ssh.written.length > 0);
    ssh.child.stderr?.emit("data", `${SUDO_PROMPT}${SUDO_PROMPT}`);

    expect(await answer).toMatchObject({
      ok: false,
      error: {
        code: "privilege_required",
        phrase: { id: "refusal.sudo.absent" },
      },
    });

    agent.closeAll();
  });

  it("does not listen for the sudo prompt on a passwordless channel", async () => {
    const { agent, ssh } = scriptedClient();

    const answer = agent.request(SERVER, "ping");

    await untilWritten(ssh, 1);
    ssh.child.stderr?.emit("data", `${SUDO_PROMPT}${SUDO_PROMPT}`);
    ssh.say(GREETING);
    await untilWritten(ssh, 2);
    ssh.say(JSON.stringify({ id: 2, ok: true, result: { ts: "now" } }));

    expect(await answer).toMatchObject({ ok: true });

    agent.closeAll();
  });
});

describe("a privileged ssh channel's password", () => {
  it("goes on the first line, before hello", async () => {
    const written: string[] = [];
    const spawn = sshSpawn(
      (_serverId, purpose) =>
        purpose === "privileged"
          ? {
              args: ["-F", "/tmp/config", "pupitre-x"],
              serveCommand: privilegedServeAs("dev"),
              preamble: "k7mp-q2xw",
            }
          : { args: ["-F", "/tmp/config", "pupitre-x"] },
      () => {
        const ssh = scripted();
        Object.assign(ssh.stdin, {
          write: (chunk: string) => {
            written.push(chunk);

            return true;
          },
        });

        return ssh.child;
      }
    );

    spawn({ purpose: "privileged", serverId: "x" });
    spawn({ purpose: "control", serverId: "x" });

    expect(written).toEqual(["k7mp-q2xw\n"]);
  });
});

describe("a channel's server", () => {
  // Falling back to the active machine would run on it what was meant for the one that disappeared.
  it("falls back to no other when it is unknown", async () => {
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

describe("an ssh that dies quickly", () => {
  // Node emits `exit` before the streams are flushed at `close`: keying on `exit` lost ssh's complaint.
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

  it("still says what it had to say", async () => {
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

/** A stand-in for `ssh` for the shapes no transcript can replay: silence, floods, a broken pipe. */
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
    protocol: 3,
    license: "dev",
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

describe("a step's message", () => {
  it("crosses live, as the agent wrote it", async () => {
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

  it("survives the replay from the report, after a drop", async () => {
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

describe("the agent's capabilities", () => {
  it("refuse a command the hello did not declare, without sending it", async () => {
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

describe("channel robustness", () => {
  it("counts the hello timeout from the first byte, not from the spawn", async () => {
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

  it("still bounds an ssh that never says anything", async () => {
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

  it("returns a refusal when the pipe breaks, rather than killing the process", async () => {
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

  it("cuts a channel that floods without ever finishing its line", async () => {
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

  it("can be cancelled by whoever launched the command, and cuts the agent", async () => {
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

  it("does not even start when the signal is already raised", async () => {
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

  it("does not start either when the signal is raised while the channel opens", async () => {
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

describe("the shape of responses, in development", () => {
  it("traces a result the contract does not describe, without failing the call", async () => {
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

describe("the shape of responses that become a command line", () => {
  it("refuses, in every build, an out-of-contract result before it reaches the pty", async () => {
    const { agent, ssh } = scriptedClient({
      enforcedResults: new Set(["snapshot"]),
    });

    const asked = agent.request(SERVER, "snapshot");

    await untilWritten(ssh, 1);
    ssh.say(GREETING);
    await untilWritten(ssh, 2);
    ssh.say(
      JSON.stringify({ id: 2, ok: true, result: { command: ["sh", "-c"] } })
    );

    const answer = await asked;

    expect(answer.ok).toBe(false);
    expect(answer.ok ? null : answer.error.phrase).toEqual({
      id: "refusal.agent.shape",
      values: { cmd: "snapshot" },
    });

    agent.closeAll();
  });

  it("lets through what has the contract's shape", async () => {
    const { agent } = client("db-shell-control.jsonl", {
      enforcedResults: new Set(["db.shell"]),
    });

    const answer = await agent.request(SERVER, "db.shell", {
      engine: "postgres",
    });

    expect(answer).toEqual({
      ok: true,
      result: { command: "sudo -u postgres psql app" },
    });

    agent.closeAll();
  });
});
