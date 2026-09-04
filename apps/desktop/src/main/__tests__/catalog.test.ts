import { afterEach, describe, expect, it } from "bun:test";
import { CatalogResultSchema } from "@pupitre/shared/agent-protocol/install";
import { type AgentClient, createAgentClient } from "../agent-client";
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
