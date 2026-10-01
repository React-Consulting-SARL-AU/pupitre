import { afterEach, describe, expect, it, spyOn } from "bun:test";
import * as fs from "node:fs";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { SecretEvent } from "@pupitre/shared/agent-protocol/secrets";
import { carriesCredential } from "@shared/services";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  credentialValue,
  forgetCredentials,
  readService,
  type ServicesDeps,
} from "../services-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "staging";

const MODULE = "db.mysql";

const LABEL = "Mot de passe applicatif";

const KEY = "MYSQL_APP_PASSWORD";

const VALUE = "Tr0p-secret-pour-un-journal";

/** `service.status` rides the passwordless sudo session, `service.secret` the privileged one opened next. */
const REVEALED = ["service-secret.jsonl", "service-secret-only.jsonl"];

function client(fixtures: string | string[]): {
  agent: AgentClient;
  deps: ServicesDeps;
  fake: FakeAgent;
} {
  const fake = fakeAgent(fixtures);
  const agent = createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 3, firstMs: 5, maxMs: 20 },
    spawn: fake.spawn,
  });

  return {
    agent,
    deps: { client: agent, declares: () => true, knows: (id) => id === SERVER },
    fake,
  };
}

function reveals(fake: FakeAgent): number {
  return fake.trace().filter((line) => line.endsWith("cmd=service.secret"))
    .length;
}

afterEach(() => {
  forgetCredentials();
});

describe("revealing a credential", () => {
  it("shows the server's value, not the variable name", async () => {
    const { agent, deps } = client(REVEALED);

    const detail = await readService(SERVER, MODULE, deps);
    const shown = await credentialValue(SERVER, MODULE, LABEL, deps);

    expect(detail.ok && detail.result.credentials).toEqual([
      LABEL,
      "Mot de passe root",
    ]);
    expect(shown).toBe(VALUE);
    expect(shown).not.toBe(KEY);

    agent.closeAll();
  });

  it("names neither the variable nor the value in what crosses the bridge", async () => {
    const { agent, deps } = client("service-secret.jsonl");

    const detail = await readService(SERVER, MODULE, deps);

    expect(JSON.stringify(detail)).not.toContain(KEY);
    expect(JSON.stringify(detail)).not.toContain(VALUE);

    agent.closeAll();
  });

  it("asks for the value again each time, the app keeps none", async () => {
    const { agent, deps, fake } = client(REVEALED);

    await readService(SERVER, MODULE, deps);

    expect(await credentialValue(SERVER, MODULE, LABEL, deps)).toBe(VALUE);
    expect(await credentialValue(SERVER, MODULE, LABEL, deps)).toBe(VALUE);
    expect(reveals(fake)).toBe(2);

    forgetCredentials(SERVER);

    expect(await credentialValue(SERVER, MODULE, LABEL, deps)).toBeNull();
    expect(reveals(fake)).toBe(2);

    agent.closeAll();
  });

  it("asks for nothing for a label the agent did not give", async () => {
    const { agent, deps, fake } = client("service-secret.jsonl");

    await readService(SERVER, MODULE, deps);

    expect(await credentialValue(SERVER, MODULE, "Inventé", deps)).toBeNull();
    expect(reveals(fake)).toBe(0);

    agent.closeAll();
  });

  it("returns nothing when the agent refuses the key", async () => {
    const { agent, deps } = client([
      "service-secret.jsonl",
      "service-secret-refused.jsonl",
    ]);

    await readService(SERVER, MODULE, deps);

    expect(await credentialValue(SERVER, MODULE, LABEL, deps)).toBeNull();

    agent.closeAll();
  });
});

describe("the path the value does not take", () => {
  it("leaves on its own event, never on the generic event stream", async () => {
    const { agent } = client("service-secret-only.jsonl");

    const events: Event[] = [];
    const secrets: SecretEvent[] = [];

    const answer = await agent.request(
      SERVER,
      "service.secret",
      { id: MODULE, key: KEY },
      {
        onEvent: (event) => events.push(event),
        onSecret: (secret) => secrets.push(secret),
      }
    );

    expect(answer).toEqual({ ok: true, result: { key: KEY } });
    expect(JSON.stringify(answer)).not.toContain(VALUE);
    expect(events).toEqual([]);
    expect(secrets).toEqual([
      { event: "secret", id: 2, key: KEY, value: VALUE },
    ]);

    agent.closeAll();
  });

  it("does not go through the renderer's generic bridge", () => {
    expect(carriesCredential("service.secret")).toBe(true);
  });

  it("appears in no written line and no file", async () => {
    const { agent, deps, fake } = client(REVEALED);

    const written: string[] = [];
    const kept = { error: console.error, log: console.log, warn: console.warn };
    const files = [
      spyOn(fs, "writeFileSync"),
      spyOn(fs, "appendFileSync"),
      spyOn(fs, "writeFile"),
    ];

    console.log = (...parts: unknown[]) => written.push(parts.join(" "));
    console.warn = console.log;
    console.error = console.log;

    try {
      await readService(SERVER, MODULE, deps);

      const shown = await credentialValue(SERVER, MODULE, LABEL, deps);

      expect(shown).toBe(VALUE);
      expect(written.join("\n")).not.toContain(VALUE);
      expect(fake.written().join("\n")).not.toContain(VALUE);

      for (const file of files) {
        expect(JSON.stringify(file.mock.calls)).not.toContain(VALUE);
      }
    } finally {
      console.error = kept.error;
      console.log = kept.log;
      console.warn = kept.warn;

      for (const file of files) {
        file.mockRestore();
      }
    }

    agent.closeAll();
  });
});
