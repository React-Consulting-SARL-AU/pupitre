import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  forgetProjects,
  listProjects,
  type ProjectDeps,
  projectEnv,
} from "../projects-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "srv-1";

let fake: FakeAgent | null = null;

function deps(): ProjectDeps {
  fake = fakeAgent("project-env-control.jsonl");

  const client: AgentClient = createAgentClient({
    backoff: { attempts: 1 },
    spawn: fake.spawn,
  });

  return { client, knows: (id) => id === SERVER };
}

beforeEach(() => {
  forgetProjects();
});

afterEach(() => {
  fake?.killAll();
  fake = null;
  forgetProjects();
});

describe("a project's environment file", () => {
  it("refuses a project the agent never declared", async () => {
    const answer = await projectEnv(SERVER, "inconnu", false, null, deps());

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "project_not_found" },
    });
  });

  it("reads the keys as they are, then rewrites the file when forced", async () => {
    const shared = deps();

    await listProjects(SERVER, shared);

    const read = await projectEnv(SERVER, "flyleaf-api", false, null, shared);
    const rewritten = await projectEnv(
      SERVER,
      "flyleaf-api",
      true,
      null,
      shared
    );

    expect(read).toMatchObject({
      ok: true,
      result: { keys: ["DATABASE_URL", "AUTH_SECRET"], written: false },
    });
    expect(rewritten).toMatchObject({
      ok: true,
      result: {
        keys: ["DATABASE_URL", "AUTH_SECRET", "STRIPE_KEY"],
        written: true,
      },
    });

    const sent = fake?.written().map((line) => JSON.parse(line)) ?? [];
    const envCalls = sent.filter((line) => line.cmd === "project.env");

    expect(envCalls.map((line) => line.params)).toEqual([
      { name: "flyleaf-api" },
      { force: true, name: "flyleaf-api" },
    ]);
  });
});
