import { afterEach, describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { CarriedRelease } from "../agent-binary";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  type AgentUpdateDeps,
  readAgentUpdate,
  readAgentUpdateShared,
  runAgentUpgrade,
  runModuleUpgrade,
} from "../agent-update-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";
const SIGNATURE = "c2lnbmF0dXJlLWVkMjU1MTktZGUtdGVzdA==";

function release(over: Partial<CarriedRelease> = {}): CarriedRelease {
  return {
    agent: {
      arch: "amd64",
      notes: ["Mise à jour de l'agent sans terminal."],
      signed: true,
      version: "0.4.0",
    },
    signature: SIGNATURE,
    ...over,
  };
}

function unsigned(): CarriedRelease {
  return release({
    agent: { arch: "amd64", notes: [], signed: false, version: "0.4.0" },
    signature: null,
  });
}

function probeOf(over: Partial<ProbeResult> = {}): ProbeResult {
  return {
    agent_version: "0.2.0",
    arch: "arm64",
    disk_free_gb: 38,
    docker: false,
    installed_modules: [],
    os: "ubuntu",
    panel: null,
    ports: [],
    ram_mb: 8192,
    sudo: true,
    version: "24.04",
    verdict: { fixes: [], kind: "managed", level: "ready", reasons: [] },
    ...over,
  };
}

let fake: FakeAgent | null = null;

function agent(
  fixtures: string | string[],
  options: Partial<Parameters<typeof createAgentClient>[0]> = {}
): AgentClient {
  fake = fakeAgent(fixtures);

  return createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 2, firstMs: 5, maxMs: 20 },
    spawn: fake.spawn,
    ...options,
  });
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

function unpublished(): AgentUpdateDeps["published"] {
  return () =>
    Promise.resolve({
      ok: false,
      error: { code: "release_not_found", message: "aucune version publiée" },
    });
}

function published(version: string): AgentUpdateDeps["published"] {
  return (arch) =>
    Promise.resolve({
      ok: true,
      result: { arch, sha256: "", signature: SIGNATURE, version },
    });
}

function deps(
  client: AgentClient,
  over: Partial<AgentUpdateDeps> = {}
): AgentUpdateDeps {
  return {
    appVersion: "0.2.0",
    carried: () => release(),
    client,
    declared: () =>
      Promise.resolve({ ok: true, result: ["runtime.node", "db.postgres"] }),
    probe: () => Promise.resolve({ ok: true, result: probeOf() }),
    published: unpublished(),
    ...over,
  };
}

function collected(): { events: Event[]; note: (event: Event) => void } {
  const events: Event[] = [];

  return { events, note: (event) => events.push(event) };
}

afterEach(() => {
  fake?.killAll();
  fake = null;
});

describe("the version comparison", () => {
  it("announces the agent the app carries when it is newer", async () => {
    const client = agent("agent-update-control.jsonl");

    const answer = await readAgentUpdate(SERVER, deps(client));

    expect(answer).toMatchObject({
      ok: true,
      result: {
        installed: "0.3.0",
        offer: { arch: "amd64", signed: true, source: "app", version: "0.4.0" },
        order: "ahead",
      },
    });
  });

  it("offers the published version rather than the one it carries", async () => {
    const client = agent("agent-update-live.jsonl");

    const answer = await readAgentUpdate(
      SERVER,
      deps(client, { published: published("0.5.0") })
    );

    expect(answer).toMatchObject({
      ok: true,
      result: {
        offer: { signed: true, source: "platform", version: "0.5.0" },
        order: "ahead",
      },
    });
  });

  it("keeps its own binary when it is ahead of what is published", async () => {
    const client = agent("agent-update-live.jsonl");

    const answer = await readAgentUpdate(
      SERVER,
      deps(client, { published: published("0.2.0") })
    );

    expect(answer).toMatchObject({
      ok: true,
      result: { offer: { source: "app", version: "0.4.0" } },
    });
  });

  it("says what the compatibility sheet thinks of the server", async () => {
    const client = agent("agent-update-control.jsonl");

    const answer = await readAgentUpdate(SERVER, deps(client));

    expect(answer).toMatchObject({
      ok: true,
      result: { floor: "0.2.0", verdict: "ok" },
    });
  });

  it("says whether the platform still answers for the server", async () => {
    const live = await readAgentUpdate(
      SERVER,
      deps(agent("agent-update-live.jsonl"))
    );

    fake?.killAll();

    const cut = await readAgentUpdate(
      SERVER,
      deps(agent("agent-update-control.jsonl"))
    );

    expect(live).toMatchObject({ ok: true, result: { platform: true } });
    expect(cut).toMatchObject({ ok: true, result: { platform: false } });
  });

  it("says the app is behind without blocking anything", async () => {
    const client = agent("agent-update-ahead.jsonl");

    const answer = await readAgentUpdate(SERVER, deps(client));
    const after = await client.request(SERVER, "snapshot");

    expect(answer).toMatchObject({
      ok: true,
      result: { installed: "0.9.0", order: "behind" },
    });
    expect(after.ok).toBe(true);
  });

  // Read every 15 s: a shell-probe fallback would open one `ssh` per tick on an unreachable server.
  it("reads the machine on the beat channel, without getting ahead of a gesture", async () => {
    const client = agent([
      "hello-then-ping.jsonl",
      "agent-update-control.jsonl",
    ]);
    const queued: string[] = [];

    await client.request(SERVER, "ping");

    const gesture = client.request(SERVER, "ping", undefined, {
      onQueued: () => queued.push("ping"),
    });
    const answer = await readAgentUpdate(SERVER, deps(client));

    await gesture;

    expect(answer).toMatchObject({ ok: true, result: { installed: "0.3.0" } });
    expect(queued).toEqual([]);
    expect(fake?.started()).toBe(2);
  });

  it("never probes the machine through the shell from the timer", async () => {
    const client = agent("protocol-mismatch.jsonl");
    let probed = 0;

    const answer = await readAgentUpdate(
      SERVER,
      deps(client, {
        carried: (arch) => (arch === "arm64" ? release() : null),
        probe: () => {
          probed += 1;

          return Promise.resolve({ ok: true, result: probeOf() });
        },
      })
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "protocol_mismatch" },
    });
    expect(probed).toBe(0);
  });

  it("reads only once when a beat lands during the previous one", async () => {
    const client = agent("snapshot-timeout.jsonl", {
      timeouts: { snapshot: 300 },
    });

    const first = readAgentUpdateShared(SERVER, deps(client));
    const second = readAgentUpdateShared(SERVER, deps(client));

    expect(second).toBe(first);

    await Promise.all([first, second]);

    expect(
      fake?.trace().filter((line) => line.includes("cmd=snapshot"))
    ).toHaveLength(1);

    expect(await until(() => fake?.live() === 0)).toBe(true);

    const third = readAgentUpdateShared(SERVER, deps(client));

    expect(third).not.toBe(first);

    await third;
  });

  it("reads the machine through the probe, on a gesture, when the protocol refuses to answer", async () => {
    const client = agent("protocol-mismatch.jsonl");
    let probed = 0;

    const answer = await runAgentUpgrade(
      SERVER,
      () => undefined,
      deps(client, {
        carried: (arch) => (arch === "arm64" ? release() : null),
        probe: () => {
          probed += 1;

          return Promise.resolve({ ok: true, result: probeOf() });
        },
      })
    );

    expect(probed).toBe(1);
    expect(answer).toMatchObject({
      ok: false,
      error: { code: "protocol_mismatch" },
    });
  });

  it("compares nothing when the app does not carry this architecture", async () => {
    const client = agent("agent-update-control.jsonl");

    const answer = await readAgentUpdate(
      SERVER,
      deps(client, { carried: () => null })
    );

    expect(answer).toMatchObject({
      ok: true,
      result: { installed: "0.3.0", offer: null, order: "unknown" },
    });
  });
});

describe("agent.upgrade", () => {
  it("sends the version and signature of the embedded release", async () => {
    const client = agent([
      "agent-update-control.jsonl",
      "agent-upgrade-ok.jsonl",
    ]);
    const { events, note } = collected();

    const answer = await runAgentUpgrade(SERVER, note, deps(client));

    expect(answer).toMatchObject({
      ok: true,
      result: {
        upgrade: {
          previous_version: "0.3.0",
          restarting: true,
          version: "0.4.0",
        },
      },
    });
    expect(events).toHaveLength(2);
  });

  it("sends only the version when the platform publishes it", async () => {
    const client = agent([
      "agent-update-live.jsonl",
      "agent-upgrade-unsigned.jsonl",
    ]);
    const { note } = collected();

    const answer = await runAgentUpgrade(
      SERVER,
      note,
      deps(client, { published: published("0.4.0") })
    );

    expect(answer).toMatchObject({
      ok: true,
      result: { upgrade: { version: "0.4.0" } },
    });
    expect(fake?.trace().some((line) => line.includes("signature"))).toBe(
      false
    );
  });

  it("migrates the configuration on the binary that was just installed", async () => {
    const client = agent([
      "agent-update-control.jsonl",
      "agent-upgrade-ok.jsonl",
      "agent-migrate-ok.jsonl",
    ]);
    const { note } = collected();

    const answer = await runAgentUpgrade(SERVER, note, deps(client));

    expect(answer).toMatchObject({
      ok: true,
      result: {
        migration: { applied: [{ slug: "rename-tz" }], revision: 2 },
        upgrade: { version: "0.4.0" },
      },
    });
  });

  // The process still answering runs the replaced binary: only a new session reaches the installed one.
  it("requests the migration only after reopening the channel", async () => {
    const client = agent([
      "agent-update-control.jsonl",
      "agent-upgrade-ok.jsonl",
      "agent-migrate-ok.jsonl",
    ]);
    const { note } = collected();

    await runAgentUpgrade(SERVER, note, deps(client));

    expect(fake?.started()).toBe(3);
  });

  it("says there was nothing to migrate when the agent does not know the command", async () => {
    const client = agent([
      "agent-update-control.jsonl",
      "agent-upgrade-ok.jsonl",
    ]);
    const { note } = collected();

    const answer = await runAgentUpgrade(SERVER, note, deps(client));

    expect(answer).toMatchObject({ ok: true, result: { migration: null } });
  });

  it("returns the verification refusal as is, with its fix", async () => {
    const client = agent([
      "agent-update-control.jsonl",
      "agent-upgrade-refused.jsonl",
    ]);
    const { note } = collected();

    const answer = await runAgentUpgrade(SERVER, note, deps(client));

    expect(answer).toEqual({
      ok: false,
      error: {
        code: "bad_signature",
        message:
          "le binaire de la version 0.4.0 ne correspond pas à sa signature : rien n'a été installé",
        fix: "Relance la mise à jour depuis l'app ; si le refus persiste, signale-le, le binaire publié est en cause.",
      },
    });
  });

  it("goes without a signature when the platform answers for the server", async () => {
    const client = agent([
      "agent-update-live.jsonl",
      "agent-upgrade-unsigned.jsonl",
    ]);
    const { events, note } = collected();

    const answer = await runAgentUpgrade(
      SERVER,
      note,
      deps(client, { carried: () => unsigned() })
    );

    expect(answer).toMatchObject({
      ok: true,
      result: {
        upgrade: {
          previous_version: "0.3.0",
          restarting: true,
          version: "0.4.0",
        },
      },
    });
    expect(events).toHaveLength(1);
  });

  it("refuses when neither the app nor the platform carries the signature", async () => {
    const client = agent("agent-update-control.jsonl");
    const { note } = collected();

    const answer = await runAgentUpgrade(
      SERVER,
      note,
      deps(client, { carried: () => unsigned() })
    );

    expect(answer.ok).toBe(false);
    expect(fake?.trace().some((line) => line.includes("agent.upgrade"))).toBe(
      false
    );
  });
});

describe("module upgrade", () => {
  it("replays the catalog modules and returns their report", async () => {
    const client = agent("module-upgrade.jsonl");
    const { events, note } = collected();

    const answer = await runModuleUpgrade(
      SERVER,
      ["runtime.node", "db.postgres"],
      note,
      deps(client)
    );

    expect(answer).toMatchObject({
      ok: true,
      result: { failed: ["db.postgres"], warned: ["runtime.node"] },
    });
    expect(events).toHaveLength(2);
  });

  it("refuses a module this server does not declare", async () => {
    const client = agent("hello-only.jsonl");
    const { note } = collected();

    const answer = await runModuleUpgrade(
      SERVER,
      ["db.mongodb"],
      note,
      deps(client)
    );

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "module_not_found" },
    });
  });
});
