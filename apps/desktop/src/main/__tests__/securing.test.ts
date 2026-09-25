import { afterEach, describe, expect, it } from "bun:test";
import type { HardenUpdate } from "@shared/harden";
import type { SudoOutcome } from "@shared/sudo";
import { type AgentClient, createAgentClient } from "../agent-client";
import { runSecuring, type SecuringDeps } from "../harden-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

let fake: FakeAgent | null = null;

function agent(fixtures: string[]): AgentClient {
  fake = fakeAgent(fixtures);

  return createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 3, firstMs: 5, maxMs: 20 },
    spawn: fake.spawn,
  });
}

function deps(client: AgentClient, sudo: SecuringDeps["sudo"]): SecuringDeps {
  let user = "root";

  return {
    client,
    close: (id) => client.close(id),
    sudo,
    switchUser: (_id, next) => {
      user = next;

      return next;
    },
    user: () => user,
  };
}

afterEach(() => {
  fake?.killAll();
  fake = null;
});

describe("runSecuring", () => {
  it("pose le mot de passe sudo une fois l'app reconnectée en dev", async () => {
    const client = agent(["harden-ok.jsonl", "hello-then-ping.jsonl"]);
    const asked: string[] = [];
    const set: SudoOutcome = { kept: true, ok: true };

    const answer = await runSecuring(
      SERVER,
      () => undefined,
      deps(client, (serverId) => {
        asked.push(serverId);

        return Promise.resolve(set);
      })
    );

    expect(asked).toEqual([SERVER]);
    expect(answer).toMatchObject({
      ok: true,
      result: { reconnected: true, sudo: set, user: "dev" },
    });
  });

  it("fait passer les étapes du mot de passe dans celles de la sécurisation", async () => {
    const client = agent(["harden-ok.jsonl", "hello-then-ping.jsonl"]);
    const updates: HardenUpdate[] = [];

    await runSecuring(
      SERVER,
      (change) => updates.push(change),
      deps(client, (_serverId, onEvent) => {
        onEvent({
          event: "step",
          id: 3,
          module: "core.hardening",
          ms: 60,
          status: "ok",
          step: "set-password",
        });

        return Promise.resolve({ kept: true, ok: true });
      })
    );

    expect(
      updates.some(
        (change) =>
          change.kind === "event" &&
          change.event.event === "step" &&
          change.event.step === "set-password"
      )
    ).toBe(true);
  });

  it("ne touche pas à sudo quand root reste ouvert", async () => {
    const client = agent(["harden-refused.jsonl"]);
    let asked = 0;

    const answer = await runSecuring(
      SERVER,
      () => undefined,
      deps(client, () => {
        asked += 1;

        return Promise.resolve({ kept: true, ok: true });
      })
    );

    expect(asked).toBe(0);
    expect(answer.ok && answer.result.sudo).toBeUndefined();
  });
});
