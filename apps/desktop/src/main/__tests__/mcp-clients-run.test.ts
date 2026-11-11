import { describe, expect, it } from "bun:test";
import {
  appEntry,
  binaryDirs,
  type CliRun,
  firstExecutable,
  type McpClientDeps,
  type McpEntry,
  machineEntry,
  plan,
  syncClients,
} from "../mcp-clients-run";

const APP = appEntry("/usr/bin/nc", "/Users/jean/.pupitre/pupitre/mcp.sock");
const ATELIER = machineEntry("/usr/bin/ssh", {
  config: "/Users/jean/.pupitre/pupitre/ssh/config",
  host: "pupitre-s1",
  sshName: "atelier",
});

interface World {
  deps: McpClientDeps;
  calls: string[];
  files: Map<string, string>;
}

function world(
  files: Record<string, string> = {},
  overrides: Partial<McpClientDeps> = {},
  codexListing = "[]"
): World {
  const calls: string[] = [];
  const held = new Map(Object.entries(files));

  const deps: McpClientDeps = {
    claudeCli: "/Users/jean/.local/bin/claude",
    claudeCodeConfig: "/Users/jean/.claude.json",
    claudeDesktopConfig: "/Users/jean/Claude/claude_desktop_config.json",
    codexCli: "/Users/jean/.local/bin/codex",
    readFile: (path) => held.get(path) ?? null,
    run: (file, args): Promise<CliRun> => {
      calls.push([file.split("/").pop(), ...args].join(" "));

      return Promise.resolve({
        code: 0,
        stdout: args[1] === "list" ? codexListing : "",
      });
    },
    writeFile: (path, content) => {
      held.set(path, content);
    },
    ...overrides,
  };

  return { calls, deps, files: held };
}

describe("the entries", () => {
  it("reaches the app through its socket", () => {
    expect(APP).toEqual({
      args: ["-U", "/Users/jean/.pupitre/pupitre/mcp.sock"],
      command: "/usr/bin/nc",
      name: "pupitre",
    });
  });

  it("reaches a machine's own MCP server over the app's SSH config, never on a prompt", () => {
    expect(ATELIER).toEqual({
      args: [
        "-F",
        "/Users/jean/.pupitre/pupitre/ssh/config",
        "-o",
        "BatchMode=yes",
        "pupitre-s1",
        "/usr/local/bin/pupitred",
        "mcp",
      ],
      command: "/usr/bin/ssh",
      name: "pupitre-atelier",
    });
  });

  it("reaches a host of the user's own SSH config by its name alone", () => {
    const entry = machineEntry("/usr/bin/ssh", {
      config: null,
      host: "box",
      sshName: "box",
    });

    expect(entry.args).toEqual([
      "-o",
      "BatchMode=yes",
      "box",
      "/usr/local/bin/pupitred",
      "mcp",
    ]);
  });
});

describe("finding the clients", () => {
  it("looks where installers put them before the bare PATH", () => {
    const dirs = binaryDirs("/Users/jean", "/usr/bin:/custom/bin");

    expect(dirs[0]).toBe("/Users/jean/.local/bin");
    expect(dirs).toContain("/custom/bin");
    expect(dirs.filter((dir) => dir === "/usr/bin")).toHaveLength(1);
  });

  it("takes the first executable found", () => {
    const found = firstExecutable(
      "claude",
      ["/a", "/b", "/c"],
      (path) => path !== "/a/claude"
    );

    expect(found).toBe("/b/claude");
  });
});

describe("plan", () => {
  it("lays what is missing, takes out what is no longer wanted, leaves the rest", () => {
    const stale: McpEntry = { ...ATELIER, name: "pupitre-old" };
    const moved: McpEntry = { ...APP, args: ["-U", "/elsewhere"] };
    const held = new Map([
      [stale.name, stale],
      [moved.name, moved],
    ]);

    expect(plan(held, [APP, ATELIER])).toEqual({
      add: [APP, ATELIER],
      remove: ["pupitre-old", "pupitre"],
    });
    expect(plan(new Map([[APP.name, APP]]), [APP])).toEqual({
      add: [],
      remove: [],
    });
  });
});

describe("syncClients", () => {
  it("declares through each client's own CLI, user-wide for Claude Code", async () => {
    const { deps, calls } = world();

    await syncClients([APP], deps);

    expect(calls).toEqual([
      "claude mcp add --scope user pupitre -- /usr/bin/nc -U /Users/jean/.pupitre/pupitre/mcp.sock",
      "codex mcp list --json",
      "codex mcp add pupitre -- /usr/bin/nc -U /Users/jean/.pupitre/pupitre/mcp.sock",
      "codex mcp list --json",
    ]);
  });

  it("touches none of a client's other servers", async () => {
    const { deps, calls } = world(
      {
        "/Users/jean/.claude.json": JSON.stringify({
          mcpServers: {
            pupitre: { args: APP.args, command: APP.command, type: "stdio" },
            "pupitre-gone": { args: [], command: "/usr/bin/ssh" },
            sentry: { url: "https://mcp.sentry.dev/mcp" },
          },
        }),
      },
      { codexCli: null }
    );

    await syncClients([APP], deps);

    expect(calls).toEqual(["claude mcp remove --scope user pupitre-gone"]);
  });

  it("reads Codex's entries from its JSON listing", async () => {
    const listing = JSON.stringify([
      {
        name: "pupitre",
        transport: { args: APP.args, command: APP.command, type: "stdio" },
      },
      { name: "cloudflare", transport: { type: "streamable_http" } },
    ]);
    const { deps, calls } = world({}, { claudeCli: null }, listing);

    await syncClients([], deps);

    expect(calls).toEqual([
      "codex mcp list --json",
      "codex mcp remove pupitre",
      "codex mcp list --json",
    ]);
  });

  it("writes Claude Desktop's file back with every other key as it was", async () => {
    const path = "/Users/jean/Claude/claude_desktop_config.json";
    const { deps, files } = world(
      {
        [path]: JSON.stringify({
          globalShortcut: "Alt+Space",
          mcpServers: { notes: { command: "notes-mcp" } },
        }),
      },
      { claudeCli: null, codexCli: null }
    );

    await syncClients([APP, ATELIER], deps);

    expect(JSON.parse(files.get(path) ?? "")).toEqual({
      globalShortcut: "Alt+Space",
      mcpServers: {
        notes: { command: "notes-mcp" },
        pupitre: { args: APP.args, command: APP.command },
        "pupitre-atelier": { args: ATELIER.args, command: ATELIER.command },
      },
    });

    await syncClients([], deps);

    expect(JSON.parse(files.get(path) ?? "")).toEqual({
      globalShortcut: "Alt+Space",
      mcpServers: { notes: { command: "notes-mcp" } },
    });
  });

  it("refuses a file that does not parse rather than replacing it", async () => {
    const path = "/Users/jean/Claude/claude_desktop_config.json";
    const { deps, files } = world(
      { [path]: "{ broken" },
      { claudeCli: null, codexCli: null }
    );

    const outcomes = await syncClients([APP], deps);

    expect(files.get(path)).toBe("{ broken");
    expect(outcomes.find((o) => o.id === "claude-desktop")?.problem).toContain(
      "does not parse"
    );
  });

  it("says which clients are missing and which CLI refused", async () => {
    const { deps } = world(
      {},
      {
        claudeDesktopConfig: null,
        codexCli: null,
        run: () => Promise.resolve({ code: 1, stdout: "" }),
      }
    );

    const outcomes = await syncClients([APP], deps);

    expect(outcomes).toEqual([
      {
        declared: [],
        found: true,
        id: "claude-code",
        problem: "pupitre: add exited 1",
      },
      { declared: [], found: false, id: "claude-desktop" },
      { declared: [], found: false, id: "codex" },
    ]);
  });

  it("reads what each client holds without changing it", async () => {
    const path = "/Users/jean/Claude/claude_desktop_config.json";
    const listing = JSON.stringify([
      { name: "pupitre-atelier", transport: { args: [], command: "ssh" } },
    ]);
    const { deps, calls, files } = world(
      {
        "/Users/jean/.claude.json": JSON.stringify({
          mcpServers: { pupitre: { args: [], command: "nc" }, sentry: {} },
        }),
        [path]: JSON.stringify({ mcpServers: {} }),
      },
      {},
      listing
    );

    const outcomes = await syncClients(null, deps);

    expect(outcomes.map((one) => one.declared)).toEqual([
      ["pupitre"],
      [],
      ["pupitre-atelier"],
    ]);
    expect(calls).toEqual(["codex mcp list --json"]);
    expect(files.get(path)).toBe(JSON.stringify({ mcpServers: {} }));
  });
});
