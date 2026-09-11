import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ProjectAddParams } from "@pupitre/shared/agent-protocol/projects";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  addProject,
  forgetProjects,
  listProjects,
  onProject,
  type ProjectDeps,
  projectHostnames,
  projectLogs,
  projectUrl,
  startProject,
  syncProject,
  updateProject,
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
  routes: [{ label: "web", port: 3000 }],
};

const SHOP: ProjectAddParams = {
  cmd: "bunx turbo run dev",
  dir: "shop",
  host: "127.0.0.1",
  name: "shop",
  pkgmgr: "bun",
  port: 3100,
  repo: "https://github.com/ada/shop.git",
  routes: [
    { label: "web", port: 3100, subdomain: "shop" },
    { label: "api", port: 3101, subdomain: "api-shop" },
    { label: "docs", port: 3102 },
  ],
};

let agent: FakeAgent | null = null;

function deps(
  fixtures: string[],
  release?: ProjectDeps["release"]
): ProjectDeps {
  agent = fakeAgent(fixtures);

  const client: AgentClient = createAgentClient({
    appVersion: "0.1.0",
    spawn: agent.spawn,
  });

  return {
    client,
    knows: (id) => id === SERVER,
    ...(release ? { release } : {}),
  };
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

describe("un projet à plusieurs ports", () => {
  it("retient chaque nom d'hôte, relâche ceux qu'une configuration retire, puis tous au retrait", async () => {
    const released: string[] = [];
    const calls = deps(
      ["project-routes-control.jsonl", "project-routes-work.jsonl"],
      (_serverId, hostname) => {
        released.push(hostname);

        return Promise.resolve();
      }
    );

    await listProjects(SERVER, calls);
    const added = await addProject(SERVER, SHOP, calls);

    expect(added.ok).toBe(true);
    expect(projectHostnames(SERVER, "shop")).toEqual([
      "shop.flymate.dev",
      "api-shop.flymate.dev",
    ]);

    const renamed = await updateProject(
      SERVER,
      {
        name: "shop",
        patch: {
          routes: [
            { label: "web", port: 3100, subdomain: "boutique" },
            { label: "docs", port: 3102 },
          ],
        },
      },
      calls
    );

    expect(renamed.ok && renamed.result.url).toBe(
      "https://boutique.flymate.dev"
    );
    expect(released).toEqual(["shop.flymate.dev", "api-shop.flymate.dev"]);
    expect(projectHostnames(SERVER, "shop")).toEqual(["boutique.flymate.dev"]);

    const command = await updateProject(
      SERVER,
      { name: "shop", patch: { cmd: "bunx turbo run dev --filter=web..." } },
      calls
    );

    expect(command.ok && command.result.cmd).toBe(
      "bunx turbo run dev --filter=web..."
    );
    expect(released).toHaveLength(2);

    const removed = await onProject("project.remove", SERVER, "shop", calls);

    expect(removed.ok).toBe(true);
    expect(released).toEqual([
      "shop.flymate.dev",
      "api-shop.flymate.dev",
      "boutique.flymate.dev",
    ]);
    expect(projectHostnames(SERVER, "shop")).toEqual([]);
  });

  it("refuse une configuration pour un projet que l'agent n'a pas nommé, et une forme hors contrat", async () => {
    const calls = deps(["project-routes-control.jsonl"]);

    const unknown = await updateProject(
      SERVER,
      { name: "ghost", patch: {} },
      calls
    );
    const malformed = await updateProject(
      SERVER,
      { name: "shop", patch: { dir: "elsewhere" } },
      calls
    );

    expect(!unknown.ok && unknown.error.code).toBe("project_not_found");
    expect(!malformed.ok && malformed.error.code).toBe("bad_request");
  });
});

describe("un journal suivi", () => {
  it("porte le signal de qui le suit jusqu'au canal", async () => {
    const seen: (AbortSignal | undefined)[] = [];
    const control = new AbortController();

    const client: ProjectDeps["client"] = {
      request: (_serverId, cmd, _params, options) => {
        seen.push(options?.signal);

        return Promise.resolve({
          ok: true,
          result:
            cmd === "project.list"
              ? ({ projects: [{ dir: "web", name: "web" }] } as never)
              : ({ lines: [] } as never),
        });
      },
    };
    const calls: ProjectDeps = { client, knows: (id) => id === SERVER };

    await listProjects(SERVER, calls);
    await projectLogs(
      SERVER,
      "web",
      50,
      true,
      () => undefined,
      calls,
      control.signal
    );

    expect(seen).toEqual([undefined, control.signal]);
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
        routes: [{ label: "web", port: 3000 }],
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
        routes: [{ label: "web", port: 3000 }],
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
        routes: [{ label: "web", port: 3001 }],
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
