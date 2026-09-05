import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ProjectAddParams } from "@pupitre/shared/agent-protocol/projects";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  addProject,
  forgetProjects,
  listProjects,
  type ProjectDeps,
  projectLogs,
  projectUrl,
  startProject,
  syncProject,
} from "../projects-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

/**
 * The chain of a first project, replayed against the fake agent.
 *
 * Two transcripts because there are two channels: the reads travel on the
 * control one, the long commands and the followed journal on the work one. The
 * order the app speaks in is what these files pin down.
 */

const SERVER = "srv-1";

const VITE: ProjectAddParams = {
  cmd: "bun run dev --port 3000",
  dir: "vite-starter",
  host: "127.0.0.1",
  name: "vite-starter",
  pkgmgr: "bun",
  port: 3000,
  repo: "https://github.com/moi/vite-starter.git",
};

let agent: FakeAgent | null = null;

function deps(fixtures: string[]): ProjectDeps {
  agent = fakeAgent(fixtures);

  const client: AgentClient = createAgentClient({
    appVersion: "0.1.0",
    spawn: agent.spawn,
  });

  return { client, knows: (id) => id === SERVER };
}

beforeEach(() => {
  forgetProjects();
});

afterEach(() => {
  agent?.killAll();
  agent = null;
});

describe("un dépôt du formulaire au journal", () => {
  it("passe de l'adresse à online avec ses lignes de journal", async () => {
    const calls = deps([
      "first-project-control.jsonl",
      "first-project-work.jsonl",
    ]);

    const known = await listProjects(SERVER, calls);
    const added = await addProject(SERVER, VITE, calls);
    const synced = await syncProject(SERVER, VITE.name, calls);
    const started = await startProject(SERVER, VITE.name, calls);
    const address = await projectUrl(SERVER, VITE.name, calls);

    const lines: string[] = [];
    const journal = await projectLogs(
      SERVER,
      VITE.name,
      200,
      true,
      (line) => lines.push(line),
      calls
    );

    expect(known.ok && known.result.projects).toEqual([]);
    expect(added.ok && added.result.name).toBe("vite-starter");
    expect(synced.ok && synced.result.installed).toBe(true);
    expect(started.ok && started.result).toMatchObject({
      port: 3000,
      state: "online",
    });
    expect(address.ok && address.result.url).toBe("http://127.0.0.1:3000");
    expect(journal.ok).toBe(true);
    expect(lines).toEqual([
      "> vite-starter@0.0.0 dev",
      "VITE v7.3.5  ready in 312 ms",
      "Local: http://127.0.0.1:3000/",
    ]);
  });
});

describe("un port déjà pris", () => {
  it("rend le remède de l'agent, qui porte le port libre", async () => {
    const calls = deps([
      "first-project-port-control.jsonl",
      "first-project-port-work.jsonl",
    ]);

    await listProjects(SERVER, calls);

    const refused = await addProject(
      SERVER,
      {
        cmd: "bun run dev --port 3000",
        dir: "shop",
        host: "127.0.0.1",
        name: "shop",
        pkgmgr: "bun",
        port: 3000,
        repo: "https://github.com/moi/shop.git",
      },
      calls
    );

    expect(refused).toMatchObject({
      error: {
        code: "bad_request",
        fix: "Donne un autre port à shop.",
        message: "le port 3000 est déjà pris par web",
        remedy: { code: "port_taken", port_free: 3001 },
      },
      ok: false,
    });
  });

  it("aboutit au second essai sur le port que le remède donne", async () => {
    const calls = deps([
      "first-project-port-control.jsonl",
      "first-project-port-work.jsonl",
    ]);

    await listProjects(SERVER, calls);
    await addProject(
      SERVER,
      {
        cmd: "bun run dev --port 3000",
        dir: "shop",
        host: "127.0.0.1",
        name: "shop",
        pkgmgr: "bun",
        port: 3000,
        repo: "https://github.com/moi/shop.git",
      },
      calls
    );

    const added = await addProject(
      SERVER,
      {
        cmd: "bun run dev --port 3001",
        dir: "shop",
        host: "127.0.0.1",
        name: "shop",
        pkgmgr: "bun",
        port: 3001,
        repo: "https://github.com/moi/shop.git",
      },
      calls
    );

    expect(added.ok && added.result.port).toBe(3001);
  });
});

describe("ce que le renderer nomme", () => {
  it("refuse un projet que l'agent n'a jamais déclaré, sans rien lui demander", async () => {
    const calls = deps([
      "first-project-control.jsonl",
      "first-project-work.jsonl",
    ]);

    const answer = await startProject(SERVER, "jamais-vu", calls);

    expect(answer).toMatchObject({
      error: { code: "project_not_found" },
      ok: false,
    });
    expect(agent?.started()).toBe(0);
  });

  it("refuse un serveur qui n'est plus dans la configuration", async () => {
    const calls = deps([
      "first-project-control.jsonl",
      "first-project-work.jsonl",
    ]);

    const answer = await listProjects("srv-parti", calls);

    expect(answer).toMatchObject({
      error: { code: "bad_request" },
      ok: false,
    });
    expect(agent?.started()).toBe(0);
  });
});
