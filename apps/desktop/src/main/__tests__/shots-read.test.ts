import { describe, expect, it } from "bun:test";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { SecretEvent } from "@pupitre/shared/agent-protocol/secrets";
import { carriesCredential } from "@shared/services";
import { createAgentClient } from "../agent-client";
import { fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

const PATH = "2026-09-04/login.png";

describe("a capture's content", () => {
  it("comes up on shot events, followed by the acknowledgement that proves them", async () => {
    const fake = fakeAgent("shots-read.jsonl");
    const agent = createAgentClient({
      appVersion: "0.1.0",
      backoff: { attempts: 3, firstMs: 5, maxMs: 20 },
      spawn: fake.spawn,
    });

    const events: Event[] = [];
    const secrets: SecretEvent[] = [];

    const answer = await agent.request(
      SERVER,
      "shots.read",
      { path: PATH },
      {
        onEvent: (event) => events.push(event),
        onSecret: (secret) => secrets.push(secret),
      }
    );

    expect(events).toEqual([
      { bytes: "Y2FwdHVyZS1kZS10", event: "shot", id: 2, seq: 0 },
      { bytes: "ZXN0", event: "shot", id: 2, seq: 1 },
    ]);
    expect(secrets).toEqual([]);
    expect(answer).toMatchObject({
      ok: true,
      result: { chunks: 2, media_type: "image/png", size_bytes: 15 },
    });

    agent.closeAll();
  });

  it("opens a second channel, the gallery does not block the dashboard", async () => {
    const fake = fakeAgent(["shots-list.jsonl", "shots-read.jsonl"]);
    const agent = createAgentClient({
      appVersion: "0.1.0",
      backoff: { attempts: 3, firstMs: 5, maxMs: 20 },
      spawn: fake.spawn,
    });

    const list = await agent.call(SERVER, "shots.list");
    const read = await agent.request(SERVER, "shots.read", { path: PATH });

    expect(list.shots).toHaveLength(1);
    expect(read.ok).toBe(true);
    expect(fake.started()).toBe(2);

    agent.closeAll();
  });

  it("goes through the generic bridge: nothing it returns is a credential", () => {
    expect(carriesCredential("shots.read")).toBe(false);
  });
});
