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

describe("la comparaison des versions", () => {
  it("annonce l'agent que l'app porte quand il est plus récent", async () => {
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

  it("propose la version publiée plutôt que celle qu'elle porte", async () => {
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

  it("garde son propre binaire quand il devance ce qui est publié", async () => {
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

  it("dit ce que la feuille de compatibilité pense du serveur", async () => {
    const client = agent("agent-update-control.jsonl");

    const answer = await readAgentUpdate(SERVER, deps(client));

    expect(answer).toMatchObject({
      ok: true,
      result: { floor: "0.2.0", verdict: "ok" },
    });
  });

  it("dit si la plateforme répond encore au serveur", async () => {
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

  it("dit que l'app est en retard sans rien empêcher", async () => {
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
  it("lit la machine sur le canal du battement, sans passer devant un geste", async () => {
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

  it("ne sonde jamais la machine par le shell depuis la minuterie", async () => {
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

  it("ne lit qu'une fois quand un battement tombe pendant le précédent", async () => {
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

  it("lit la machine par la sonde, sur un geste, quand le protocole refuse de répondre", async () => {
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

  it("ne compare rien quand l'app ne porte pas cette architecture", async () => {
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
  it("envoie la version et la signature de la release embarquée", async () => {
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

  it("n'envoie que la version quand la plateforme la publie", async () => {
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

  it("migre la configuration sur le binaire qui vient d'être installé", async () => {
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
  it("ne demande la migration qu'après avoir rouvert le canal", async () => {
    const client = agent([
      "agent-update-control.jsonl",
      "agent-upgrade-ok.jsonl",
      "agent-migrate-ok.jsonl",
    ]);
    const { note } = collected();

    await runAgentUpgrade(SERVER, note, deps(client));

    expect(fake?.started()).toBe(3);
  });

  it("dit qu'il n'y avait rien à migrer quand l'agent ignore la commande", async () => {
    const client = agent([
      "agent-update-control.jsonl",
      "agent-upgrade-ok.jsonl",
    ]);
    const { note } = collected();

    const answer = await runAgentUpgrade(SERVER, note, deps(client));

    expect(answer).toMatchObject({ ok: true, result: { migration: null } });
  });

  it("rend le refus de vérification tel quel, avec son remède", async () => {
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

  it("part sans signature quand la plateforme répond au serveur", async () => {
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

  it("refuse quand ni l'app ni la plateforme ne portent la signature", async () => {
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

describe("upgrade des modules", () => {
  it("rejoue les modules du catalogue et rend leur rapport", async () => {
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

  it("refuse un module que ce serveur ne déclare pas", async () => {
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
