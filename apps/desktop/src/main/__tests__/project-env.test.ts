import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  forgetProjects,
  listProjects,
  type ProjectDeps,
  projectEnv,
} from "../projects-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

/**
 * The environment file of a project, replayed against the fake agent.
 *
 * What is pinned down: the renderer names a project the list gave, `force`
 * only travels when asked, and what comes back is the keys — never a value.
 */

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

describe("le fichier d'environnement d'un projet", () => {
  it("refuse un projet que l'agent n'a jamais déclaré", async () => {
    const answer = await projectEnv(SERVER, "inconnu", false, deps());

    expect(answer).toMatchObject({
      ok: false,
      error: { code: "project_not_found" },
    });
  });

  it("lit les clés telles quelles, puis réécrit le fichier quand on force", async () => {
    const shared = deps();

    await listProjects(SERVER, shared);

    const read = await projectEnv(SERVER, "flymate-api", false, shared);
    const rewritten = await projectEnv(SERVER, "flymate-api", true, shared);

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
      { name: "flymate-api" },
      { force: true, name: "flymate-api" },
    ]);
  });
});
