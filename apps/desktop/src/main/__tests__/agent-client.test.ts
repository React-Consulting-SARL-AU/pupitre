import { describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import {
  AgentCallError,
  type AgentClient,
  createAgentClient,
  defaultTimeout,
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
  it("dit hello tout seul, puis rejoue la transcription d'AGT-01", async () => {
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

  it("écrit le secret sur l'entrée standard, juste après la requête", async () => {
    const { agent, fake } = client("secrets-stream.jsonl");

    const done = await agent.call(
      SERVER,
      "secrets.set",
      { key: "API_KEY", secrets_stdin: true },
      { secrets: { API_KEY: "s3cret-de-test" } }
    );

    expect(done).toEqual({ done: true });
    expect(fake.trace().join("\n")).not.toContain("s3cret-de-test");

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
