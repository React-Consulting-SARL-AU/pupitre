import { describe, expect, it } from "bun:test";
import type { AgentResponse } from "@shared/agent";
import { dialogTextIn } from "../dialogs";
import type { McpResult } from "../mcp-session";
import {
  appMcpTools,
  type McpRequest,
  type McpToolDeps,
} from "../mcp-tools-run";

function ok<T>(result: T): Promise<AgentResponse<T>> {
  return Promise.resolve({ ok: true, result });
}

function nobodyCalls(): never {
  throw new Error("not expected");
}

interface Recorder {
  deps: McpToolDeps;
  asked: McpRequest[];
  ran: string[];
}

function recorder(
  overrides: Partial<McpToolDeps> = {},
  allow = true
): Recorder {
  const asked: McpRequest[] = [];
  const ran: string[] = [];

  const deps: McpToolDeps = {
    addProject: (serverId, params) => {
      ran.push(`add ${serverId} ${params.name}`);

      return ok({ name: params.name } as never);
    },
    catalog: () => ok({ modules: [] } as never),
    check: () => ok({ problems: [], warnings: [] }),
    confirm: (request) => {
      asked.push(request);

      return Promise.resolve(allow);
    },
    detect: (_serverId, params) => ok({ asked: params } as never),
    install: (serverId, modules) => {
      ran.push(`install ${serverId} ${modules.join(",")}`);

      return ok({ installed: modules } as never);
    },
    machines: () => [{ entry: "pupitre-atelier", id: "s1", name: "Atelier" }],
    projects: () => ok({ projects: [] } as never),
    removeProject: (serverId, name) => {
      ran.push(`remove ${serverId} ${name}`);

      return ok({ removed: name } as never);
    },
    say: (key, values) => dialogTextIn("en", key, values),
    secretFields: () => ok({ "db.postgres": ["password"] }),
    unattended: () => false,
    uninstall: (serverId, modules) => {
      ran.push(`uninstall ${serverId} ${modules.join(",")}`);

      return ok({ failed: [] });
    },
    updateProject: (serverId, params) => {
      ran.push(`update ${serverId} ${params.name}`);

      return ok({ name: params.name } as never);
    },
    worded: (phrase) =>
      phrase.id === "refusal.sudo.absent"
        ? { fix: "Enter it in Settings.", message: "No sudo password here." }
        : null,
    ...overrides,
  };

  return { asked, deps, ran };
}

function call(
  deps: McpToolDeps,
  name: string,
  args: unknown
): Promise<McpResult> {
  const tool = appMcpTools(deps).find((known) => known.name === name);

  if (!tool) {
    throw new Error(`no tool ${name}`);
  }

  return tool.run(args);
}

function said(result: McpResult): string {
  return result.content[0]?.text ?? "";
}

describe("the app's MCP tools", () => {
  it("marks only reads as read-only", () => {
    const tools = appMcpTools(recorder().deps);
    const readOnly = tools
      .filter((tool) => tool.annotations.readOnlyHint)
      .map((tool) => tool.name);

    expect(readOnly).toEqual([
      "servers",
      "catalog",
      "project_list",
      "project_detect",
    ]);
  });

  it("lists the servers with the entry that runs each one", async () => {
    const result = await call(recorder().deps, "servers", {});

    expect(JSON.parse(said(result))).toEqual([
      { entry: "pupitre-atelier", id: "s1", name: "Atelier" },
    ]);
  });

  it("refuses a server the app does not manage", async () => {
    const result = await call(recorder().deps, "catalog", { server: "s9" });

    expect(result.isError).toBe(true);
    expect(said(result)).toContain("unknown server: s9");
  });

  it("refuses an argument the contract does not name", async () => {
    const { deps, asked } = recorder();
    const result = await call(deps, "module_uninstall", {
      modules: ["db.redis"],
      server: "s1",
      sudo: "hunter2",
    });

    expect(result.isError).toBe(true);
    expect(asked).toEqual([]);
  });

  it("detects from a repository or a folder, never both", async () => {
    const { deps } = recorder();
    const both = await call(deps, "project_detect", {
      dir: "/home/dev/shop",
      repo: "git@github.com:a/shop.git",
      server: "s1",
    });
    const repo = await call(deps, "project_detect", {
      branch: "main",
      repo: "git@github.com:a/shop.git",
      server: "s1",
    });

    expect(both.isError).toBe(true);
    expect(JSON.parse(said(repo))).toEqual({
      asked: { branch: "main", repo: "git@github.com:a/shop.git" },
    });
  });

  it("runs a change only once the owner allowed it", async () => {
    const { deps, asked, ran } = recorder();
    const result = await call(deps, "project_remove", {
      name: "shop",
      server: "s1",
    });

    expect(asked).toEqual([
      {
        detail:
          "•  Its processes stop and its addresses go.\n\nAsked by an AI agent on this computer.",
        serverId: "s1",
        serverName: "Atelier",
        title: "Remove the project shop from Atelier?",
        tool: "project_remove",
      },
    ]);
    expect(ran).toEqual(["remove s1 shop"]);
    expect(result.isError).toBeUndefined();
  });

  it("runs a change without asking once the owner chose so", async () => {
    const { deps, asked, ran } = recorder({ unattended: () => true }, false);

    await call(deps, "project_remove", { name: "shop", server: "s1" });

    expect(asked).toEqual([]);
    expect(ran).toEqual(["remove s1 shop"]);
  });

  it("shows the owner only what an update changes in the project", async () => {
    const { deps, asked } = recorder({
      projects: () =>
        ok({
          projects: [
            {
              boot: false,
              branch: "main",
              name: "shop",
              processes: [{ cmd: "bun dev", id: "web", routes: [] }],
            },
          ],
        } as never),
    });

    await call(deps, "project_update", {
      name: "shop",
      patch: { boot: false, branch: "next" },
      server: "s1",
    });

    expect(asked[0]?.title).toBe("Change the project shop on Atelier?");
    expect(asked[0]?.detail).toBe(
      "•  Branch: main → next\n\nAsked by an AI agent on this computer."
    );
  });

  it("names the modules from the catalogue in the question", async () => {
    const { deps, asked } = recorder({
      catalog: () =>
        ok({
          modules: [
            {
              fields: [{ key: "version", kind: "select", label: "Version" }],
              id: "db.postgres",
              name: "PostgreSQL",
            },
          ],
        } as never),
    });

    await call(deps, "module_install", {
      config: { "db.postgres": { version: "17" } },
      modules: ["db.postgres"],
      server: "s1",
    });

    expect(asked[0]?.title).toBe(
      "Install or reconfigure PostgreSQL on Atelier?"
    );
    expect(asked[0]?.detail).toStartWith(
      "•  PostgreSQL (db.postgres)\n    Version: 17\n"
    );
  });

  it("runs nothing the owner refused, and says so to the model", async () => {
    const { deps, ran } = recorder({}, false);
    const result = await call(deps, "module_uninstall", {
      modules: ["db.redis"],
      server: "s1",
    });

    expect(ran).toEqual([]);
    expect(result.isError).toBe(true);
    expect(said(result)).toContain("did not allow");
  });

  it("passes a project update without the server key", async () => {
    let seen: unknown = null;
    const { deps } = recorder({
      updateProject: (_serverId, params) => {
        seen = params;

        return ok({} as never);
      },
    });

    await call(deps, "project_update", {
      name: "shop",
      patch: { branch: "next" },
      server: "s1",
    });

    expect(seen).toEqual({ name: "shop", patch: { branch: "next" } });
  });

  it("refuses a secret in the configuration before asking anyone", async () => {
    const { deps, asked, ran } = recorder();
    const result = await call(deps, "module_install", {
      config: { "db.postgres": { password: "hunter2", version: "17" } },
      modules: ["db.postgres"],
      server: "s1",
    });

    expect(result.isError).toBe(true);
    expect(said(result)).toContain("db.postgres.password");
    expect(said(result)).not.toContain("hunter2");
    expect(asked).toEqual([]);
    expect(ran).toEqual([]);
  });

  it("returns the check's problems instead of asking the owner", async () => {
    const { deps, asked } = recorder({
      check: () =>
        ok({
          problems: [
            { key: "version", message: "unknown", module: "db.postgres" },
          ],
          warnings: [],
        } as never),
    });
    const result = await call(deps, "module_install", {
      config: { "db.postgres": { version: "3" } },
      modules: ["db.postgres"],
      server: "s1",
    });

    expect(result.isError).toBe(true);
    expect(said(result)).toContain("unknown");
    expect(asked).toEqual([]);
  });

  it("installs a checked configuration once allowed", async () => {
    const { deps, ran } = recorder();

    await call(deps, "module_install", {
      config: { "db.postgres": { version: "17" } },
      modules: ["db.postgres"],
      server: "s1",
    });

    expect(ran).toEqual(["install s1 db.postgres"]);
  });

  it("gives the agent's refusal with its fix", async () => {
    const { deps } = recorder({
      projects: () =>
        Promise.resolve({
          error: {
            code: "license_required",
            fix: "Ask for a licence.",
            message: "This server has no licence.",
          },
          ok: false,
        }),
      removeProject: nobodyCalls,
    });
    const result = await call(deps, "project_list", { server: "s1" });

    expect(said(result)).toBe(
      "license_required: This server has no licence.\nAsk for a licence."
    );
  });

  it("words the app's own refusal instead of handing its dictionary id", async () => {
    const { deps } = recorder({
      check: () =>
        Promise.resolve({
          error: {
            code: "privilege_required",
            message: "refusal.sudo.absent",
            phrase: { id: "refusal.sudo.absent" },
          },
          ok: false,
        }),
    });
    const result = await call(deps, "module_install", {
      modules: ["db.redis"],
      server: "s1",
    });

    expect(said(result)).toBe(
      "privilege_required: No sudo password here.\nEnter it in Settings."
    );
  });
});
