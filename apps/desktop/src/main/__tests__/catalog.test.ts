import { afterEach, describe, expect, it } from "bun:test";
import { CatalogResultSchema } from "@pupitre/shared/agent-protocol/install";
import { type AgentClient, createAgentClient } from "../agent-client";
import { catalogCache } from "../catalog-cache";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

/**
 * The catalogue as it crosses the channel: what the agent declares is what the
 * client hands over. Two transcripts, one module apart, and no line of this
 * file names a module.
 */

let agent: FakeAgent | null = null;

function client(fixture: string): AgentClient {
  agent = fakeAgent(fixture);

  return createAgentClient({ spawn: agent.spawn, appVersion: "0.1.0" });
}

function fakeClient(fixtures: string[]): AgentClient {
  agent = fakeAgent(fixtures);

  return createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 2, firstMs: 5, maxMs: 20 },
    spawn: agent.spawn,
  });
}

afterEach(() => {
  agent?.killAll();
  agent = null;
});

describe("la commande catalog", () => {
  it("rend un catalogue conforme au schéma du contrat", async () => {
    const answer = await client("catalog-v1.jsonl").request("srv-1", "catalog");

    expect(answer.ok).toBe(true);
    expect(
      answer.ok && CatalogResultSchema.safeParse(answer.result).success
    ).toBe(true);
  });

  it("rend les modules du premier agent", async () => {
    const answer = await client("catalog-v1.jsonl").request("srv-1", "catalog");

    expect(answer.ok && answer.result.modules.map((m) => m.id)).toEqual([
      "core.system",
      "db.postgres",
    ]);
  });

  it("rend un module de plus quand l'agent en déclare un de plus", async () => {
    const answer = await client("catalog-v2.jsonl").request("srv-1", "catalog");

    expect(answer.ok && answer.result.modules.map((m) => m.id)).toEqual([
      "core.system",
      "db.postgres",
      "db.clickhouse",
    ]);
    expect(
      answer.ok &&
        answer.result.modules.at(-1)?.fields.map((field) => field.kind)
    ).toEqual(["secret"]);
  });
});

/**
 * The catalogue is one agent's, over one session. Closing the channels —
 * an upgrade, a re-push, another account — or a hello that names another
 * version means another agent may answer, and what it declares is asked again.
 */
describe("le catalogue gardé d'un serveur", () => {
  async function until(condition: () => boolean): Promise<boolean> {
    for (let i = 0; i < 200; i += 1) {
      if (condition()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    return condition();
  }

  it("se relit une fois les canaux fermés", async () => {
    const client = fakeClient(["catalog-v1.jsonl", "catalog-v2.jsonl"]);
    const cache = catalogCache(client);

    const first = await cache.declaredModules("srv-1");
    const again = await cache.declaredModules("srv-1");

    expect(first.ok && first.result).toEqual(["core.system", "db.postgres"]);
    expect(again).toEqual(first);
    expect(
      agent?.trace().filter((line) => line.includes("catalog"))
    ).toHaveLength(1);

    client.close("srv-1");

    const after = await cache.declaredModules("srv-1");

    expect(after.ok && after.result).toEqual([
      "core.system",
      "db.postgres",
      "db.clickhouse",
    ]);
    expect(agent?.started()).toBe(2);
  });

  it("se relit quand un autre agent répond au hello", async () => {
    const client = fakeClient(["catalog-v1.jsonl", "catalog-upgraded.jsonl"]);
    const cache = catalogCache(client);

    await cache.declaredManifests("srv-1");

    agent?.killAll();
    expect(await until(() => client.session("srv-1") === null)).toBe(true);

    const after = await cache.declaredManifests("srv-1");

    expect(after.ok && after.result.map((m) => m.id)).toContain(
      "db.clickhouse"
    );
    expect(client.session("srv-1")?.agent_version).toBe("0.5.0");
  });
});
