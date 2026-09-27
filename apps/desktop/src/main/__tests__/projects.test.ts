import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { ProjectAddParams } from "@pupitre/shared/agent-protocol/projects";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  addProject,
  declaresProject,
  editorFolder,
  forgetProjects,
  installProject,
  listProjects,
  noteProjects,
  onProject,
  type ProjectDeps,
  projectHostnames,
  projectLogs,
  pullProject,
  startProject,
  updateProject,
} from "../projects-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "srv-1";

const VITE: ProjectAddParams = {
  boot: false,
  dir: "vite-starter",
  name: "vite-starter",
  processes: [
    {
      cmd: "bun run dev --port 3000",
      dir: ".",
      host: "127.0.0.1",
      id: "vite-starter",
      pkgmgr: "bun",
      port: 3000,
      routes: [{ label: "web", port: 3000 }],
    },
  ],
  protected: true,
  repo: "https://github.com/moi/vite-starter.git",
};

const SHOP: ProjectAddParams = {
  boot: false,
  dir: "shop",
  name: "shop",
  processes: [
    {
      cmd: "bunx turbo run dev",
      dir: ".",
      host: "127.0.0.1",
      id: "shop",
      pkgmgr: "bun",
      port: 3100,
      routes: [
        { label: "web", port: 3100, subdomain: "shop" },
        { label: "api", port: 3101, subdomain: "api-shop" },
        { label: "docs", port: 3102 },
      ],
    },
  ],
  protected: true,
  repo: "https://github.com/ada/shop.git",
};

function single(name: string, port: number): ProjectAddParams {
  return {
    boot: false,
    dir: name,
    name,
    processes: [
      {
        cmd: `bun run dev --port ${port}`,
        dir: ".",
        host: "127.0.0.1",
        id: name,
        pkgmgr: "bun",
        port,
        routes: [{ label: "web", port }],
      },
    ],
    protected: true,
    repo: `https://github.com/moi/${name}.git`,
  };
}

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
      "first-project-follow.jsonl",
    ]);

    const known = await listProjects(SERVER, calls);
    const added = await addProject(SERVER, VITE, calls);
    const pulled = await pullProject(SERVER, VITE.name, calls);
    const installed = await installProject(SERVER, VITE.name, calls);
    const started = await startProject(SERVER, VITE.name, calls);

    const lines: string[] = [];
    const journal = await projectLogs(
      SERVER,
      VITE.name,
      "vite-starter",
      200,
      true,
      (line: string) => lines.push(line),
      calls
    );

    expect(known.ok && known.result.projects).toEqual([]);
    expect(added.ok && added.result.name).toBe("vite-starter");
    expect(pulled.ok && pulled.result).toEqual({
      pulled: true,
      state: "stopped",
    });
    expect(installed.ok && installed.result.installed).toEqual([
      { command: "bun install", process: "vite-starter" },
    ]);
    expect(started.ok && started.result).toMatchObject({ state: "online" });
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
      "shop.flyleaf.dev",
      "api-shop.flyleaf.dev",
    ]);

    const shop = {
      cmd: "bunx turbo run dev",
      dir: ".",
      host: "127.0.0.1" as const,
      id: "shop",
      install: "",
      pkgmgr: "bun" as const,
      port: 3100,
    };
    const renamed = await updateProject(
      SERVER,
      {
        name: "shop",
        patch: {
          processes: [
            {
              ...shop,
              routes: [
                { label: "web", port: 3100, subdomain: "boutique" },
                { label: "docs", port: 3102 },
              ],
            },
          ],
        },
      },
      calls
    );

    expect(renamed.ok && renamed.result.url).toBe(
      "https://boutique.flyleaf.dev"
    );
    expect(released).toEqual(["shop.flyleaf.dev", "api-shop.flyleaf.dev"]);
    expect(projectHostnames(SERVER, "shop")).toEqual(["boutique.flyleaf.dev"]);

    const command = await updateProject(
      SERVER,
      {
        name: "shop",
        patch: {
          processes: [
            {
              ...shop,
              cmd: "bunx turbo run dev --filter=web...",
              routes: [
                {
                  hostname: "boutique.flyleaf.dev",
                  label: "web",
                  port: 3100,
                },
                { label: "docs", port: 3102 },
              ],
            },
          ],
        },
      },
      calls
    );

    expect(command.ok && command.result.processes[0]?.cmd).toBe(
      "bunx turbo run dev --filter=web..."
    );
    expect(released).toHaveLength(2);

    const removed = await onProject("project.remove", SERVER, "shop", calls);

    expect(removed.ok).toBe(true);
    expect(released).toEqual([
      "shop.flyleaf.dev",
      "api-shop.flyleaf.dev",
      "boutique.flyleaf.dev",
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

    const refused = await addProject(SERVER, single("shop", 3000), calls);

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
    await addProject(SERVER, single("shop", 3000), calls);

    const added = await addProject(SERVER, single("shop", 3001), calls);

    expect(added.ok && added.result.processes[0]?.port).toBe(3001);
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

  it("tient pour déclaré un projet qu'un snapshot a nommé", () => {
    expect(declaresProject(SERVER, "react-box")).toBe(false);

    noteProjects(SERVER, "snapshot", {
      ok: true,
      result: {
        projects: [
          {
            dir: "react-box",
            name: "react-box",
            path: "/home/dev/projects/react-box",
            processes: [
              {
                routes: [
                  {
                    hostname: "react-box.example.org",
                    label: "web",
                    port: 3000,
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(declaresProject(SERVER, "react-box")).toBe(true);
    expect(projectHostnames(SERVER, "react-box")).toEqual([
      "react-box.example.org",
    ]);

    noteProjects(SERVER, "service.status", {
      ok: true,
      result: { projects: [{ name: "ghost", dir: "ghost" }] },
    });
    noteProjects(SERVER, "snapshot", {
      ok: false,
      error: { code: "internal", message: "coupé" },
    });

    expect(declaresProject(SERVER, "ghost")).toBe(false);
  });

  it("n'ouvre dans un éditeur qu'un dossier que l'agent a nommé", () => {
    noteProjects(SERVER, "snapshot", {
      ok: true,
      result: {
        projects: [
          { dir: "shop", name: "shop", path: "/home/dev/projects/shop" },
        ],
      },
    });

    expect(editorFolder(SERVER, "/home/dev/projects/shop", null)).toBe(
      "/home/dev/projects/shop"
    );
    expect(editorFolder(SERVER, "/home/dev/projects/other", null)).toBeNull();
    expect(editorFolder("srv-2", "/home/dev/projects/shop", null)).toBeNull();

    expect(editorFolder(SERVER, "/home/dev/notes", "/home/dev")).toBe(
      "/home/dev/notes"
    );
    expect(editorFolder(SERVER, "/home/dev", "/home/dev")).toBe("/home/dev");
    expect(editorFolder(SERVER, "/home/devious", "/home/dev")).toBeNull();
    expect(editorFolder(SERVER, "/etc", "/home/dev")).toBeNull();
    expect(editorFolder(SERVER, "/home/dev/../root", "/home/dev")).toBeNull();
    expect(editorFolder(SERVER, "/home/dev/a\nb", "/home/dev")).toBeNull();
    expect(editorFolder(SERVER, "projects/shop", "/home/dev")).toBeNull();
    expect(editorFolder(SERVER, 42, "/home/dev")).toBeNull();
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
