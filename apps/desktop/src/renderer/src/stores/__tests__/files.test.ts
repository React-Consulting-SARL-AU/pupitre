import { beforeEach, describe, expect, it } from "bun:test";
import type { CommandName } from "@pupitre/shared/agent-protocol";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import type { AgentResponse } from "@shared/agent";
import { stubPupitre } from "../../__tests__/stub-pupitre";
import { base64Of, bytesOf, fingerprint } from "../../lib/file-bytes";
import { useFiles } from "../files";

const SERVER = "srv-1";

const ROOT = { root: "/home/dev/projects" };

const ENV = "PORT=3000\n";

function entry(name: string, kind: FileEntry["kind"] = "file"): FileEntry {
  return {
    kind,
    mode: "0644",
    modified_at: "2026-09-01T10:00:00Z",
    name,
    size_bytes: 10,
  };
}

const TREE: Record<string, FileEntry[]> = {
  "": [entry("projects", "dir"), entry(".bashrc")],
  projects: [entry("atlas", "dir")],
  "projects/atlas": [entry("src", "dir"), entry(".env"), entry("logo.png")],
  "projects/atlas/src": [entry("index.ts")],
};

interface Call {
  cmd: CommandName;
  params: unknown;
}

interface Agent {
  calls: Call[];
  write?: (params: { sha256?: string }) => unknown;
  /** The digest `fs.stat { hash: true }` reports, when a test moves the file. */
  onServer?: string;
  /** A wrong receipt for `fs.read`, to see the app refuse it. */
  receipt?: Partial<{ sha256: string; chunks: number }>;
  /** Refuses `fs.remove` unless recursive, as on a folder that holds something. */
  held?: number;
  slowList?: () => Promise<void>;
  rename?: () => unknown;
}

async function readAnswer(
  path: string,
  agent: Agent,
  onEvent: (e: Event) => void
): Promise<AgentResponse<unknown>> {
  const bytes = bytesOf(ENV);

  onEvent({ bytes: base64Of(bytes), event: "file", id: 3, seq: 0 });

  return {
    ok: true,
    result: {
      chunks: 1,
      media_type: path.endsWith(".svg") ? "image/svg+xml" : "text/plain",
      path,
      sha256: await fingerprint(bytes),
      size_bytes: bytes.length,
      ...agent.receipt,
    },
  };
}

function refused(message: string, fix?: string): AgentResponse<never> {
  return { error: { code: "bad_request", fix, message }, ok: false };
}

function stat(
  path: string,
  agent: Agent,
  hash: boolean
): AgentResponse<unknown> {
  const name = path.split("/").at(-1) ?? "";
  const kind = Object.keys(TREE).includes(path) ? "dir" : "file";
  const image = name.endsWith(".png");

  return {
    ok: true,
    result: {
      kind,
      mode: "0644",
      modified_at: "2026-09-01T10:00:00Z",
      path,
      size_bytes: 10,
      ...(kind === "file" && !name.endsWith(".zip")
        ? { media_type: image ? "image/png" : "text/plain" }
        : {}),
      ...(hash ? { sha256: agent.onServer ?? "" } : {}),
    },
  };
}

function agentOf(agent: Agent): void {
  const answer = async (
    cmd: CommandName,
    params: unknown
  ): Promise<AgentResponse<unknown>> => {
    const asked = params as {
      path: string;
      to?: string;
      recursive?: boolean;
      hash?: boolean;
      sha256?: string;
    };

    agent.calls.push({ cmd, params });

    switch (cmd) {
      case "fs.list": {
        await agent.slowList?.();
        const entries = TREE[asked.path];

        return entries
          ? {
              ok: true,
              result: { entries, path: asked.path, truncated: false },
            }
          : refused(`missing: ${asked.path}`, "List it with fs.list.");
      }
      case "fs.stat":
        return stat(asked.path, agent, asked.hash === true);
      case "fs.write":
        return (
          (agent.write?.(asked) as AgentResponse<unknown> | undefined) ?? {
            ok: true,
            result: {
              path: asked.path,
              sha256: "b".repeat(64),
              size_bytes: 12,
            },
          }
        );
      case "fs.rename":
        return (
          (agent.rename?.() as AgentResponse<unknown> | undefined) ?? {
            ok: true,
            result: { path: asked.to ?? asked.path },
          }
        );
      case "fs.mkdir":
        return { ok: true, result: { path: asked.to ?? asked.path } };
      case "fs.remove":
        return agent.held !== undefined && !asked.recursive
          ? refused(
              `the folder is not empty: ${asked.path} holds ${agent.held} entries`,
              "Call fs.remove again with recursive: true."
            )
          : { ok: true, result: { path: asked.path, removed: 1 } };
      default:
        return refused("unknown");
    }
  };

  stubPupitre({
    agentCall: (_serverId: string, cmd: CommandName, params?: unknown) =>
      answer(cmd, params),
    agentStream: async (
      _serverId: string,
      cmd: CommandName,
      params: unknown,
      onEvent: (event: Event) => void
    ): Promise<AgentResponse<unknown>> => {
      agent.calls.push({ cmd, params });

      const asked = params as { path: string };

      return asked.path.endsWith(".zip")
        ? refused("unsupported file type: zip", "Download this file.")
        : readAnswer(asked.path, agent, onEvent);
    },
    completions: () =>
      Promise.resolve({
        ok: true,
        result: {
          command: "dev",
          path: "",
          paths: [],
          projects: [],
          sub: [],
          ...ROOT,
        },
      }),
    openInEditor: () => Promise.resolve(),
  });
}

function calls(agent: Agent, cmd: CommandName): Call[] {
  return agent.calls.filter((call) => call.cmd === cmd);
}

async function opened(agent: Agent = { calls: [] }): Promise<Agent> {
  agentOf(agent);
  await useFiles.getState().open(SERVER, "/home/dev/projects/atlas");

  return agent;
}

beforeEach(() => {
  useFiles.getState().forget();
});

describe("the file browser", () => {
  it("attaches a project's root under the one the agent names, and lists the folder", async () => {
    const agent = await opened();

    expect(useFiles.getState().workRoot).toBe("/home/dev");
    expect(useFiles.getState().root).toBe("projects/atlas");
    expect(useFiles.getState().listing).toMatchObject({
      path: "projects/atlas",
      status: "read",
    });
    expect(calls(agent, "fs.list").map((c) => c.params)).toEqual([
      { path: "projects/atlas" },
    ]);
  });

  it("refuses a project that does not live under the working root, without guessing", async () => {
    agentOf({ calls: [] });

    await useFiles.getState().open(SERVER, "/srv/elsewhere");

    expect(useFiles.getState().root).toBeNull();
    expect(useFiles.getState().listing).toMatchObject({
      error: { phrase: { id: "files.outsideRoot" } },
      status: "failed",
    });
  });

  it("only sets a listing on the requested folder, never on the one that was left", async () => {
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const agent: Agent = { calls: [] };

    await opened(agent);

    agent.slowList = () => held;
    const slow = useFiles.getState().browse(SERVER, "projects/atlas/src");

    agent.slowList = undefined;
    await useFiles.getState().browse(SERVER, "projects");

    expect(useFiles.getState().listing).toMatchObject({
      path: "projects",
      status: "read",
    });

    release();
    await slow;

    expect(useFiles.getState().listing).toMatchObject({
      path: "projects",
      status: "read",
    });
  });

  it("keeps the refusal of a missing folder with its fix", async () => {
    await opened();

    await useFiles.getState().browse(SERVER, "projects/nowhere");

    expect(useFiles.getState().listing).toMatchObject({
      error: {
        fix: "List it with fs.list.",
        message: "missing: projects/nowhere",
      },
      path: "projects/nowhere",
      status: "failed",
    });
  });
});

describe("the preview of a file", () => {
  it("reassembles the chunks, checks the digest and decodes the text", async () => {
    await opened();

    await useFiles.getState().show(SERVER, "projects/atlas/.env");

    expect(useFiles.getState().preview).toMatchObject({
      path: "projects/atlas/.env",
      sha256: await fingerprint(bytesOf(ENV)),
      status: "text",
      text: ENV,
    });
  });

  it("reads an SVG as text, to edit it as well as to render it", async () => {
    await opened();

    await useFiles.getState().show(SERVER, "projects/atlas/logo.svg");

    expect(useFiles.getState().preview).toMatchObject({
      path: "projects/atlas/logo.svg",
      status: "text",
      text: ENV,
    });
  });

  it("opens each file on its rendered form, and keeps the requested code until the next one", async () => {
    await opened();

    await useFiles.getState().show(SERVER, "projects/atlas/README.md");
    expect(useFiles.getState().view).toBe("rendered");

    useFiles.getState().setView("source");
    expect(useFiles.getState().view).toBe("source");

    await useFiles.getState().show(SERVER, "projects/atlas/logo.svg");
    expect(useFiles.getState().view).toBe("rendered");
  });

  it("refuses a file whose digest is not the one in the receipt", async () => {
    await opened({ calls: [], receipt: { sha256: "0".repeat(64) } });

    await useFiles.getState().show(SERVER, "projects/atlas/.env");

    expect(useFiles.getState().preview).toMatchObject({
      error: { code: "internal" },
      status: "failed",
    });
  });

  it("shows the card of a type the agent does not render, without reading it", async () => {
    const agent = await opened();

    await useFiles.getState().show(SERVER, "projects/atlas/site.zip");

    expect(useFiles.getState().preview).toMatchObject({
      error: null,
      stat: { size_bytes: 10 },
      status: "unreadable",
    });
    expect(calls(agent, "fs.read")).toHaveLength(0);
  });

  it("keeps the agent's refusal when the read is refused before it happens", async () => {
    await opened();

    stubPupitre({
      ...(window.pupitre as object),
      agentCall: (
        _s: string,
        cmd: CommandName,
        params?: unknown
      ): Promise<AgentResponse<unknown>> =>
        cmd === "fs.stat"
          ? Promise.resolve({
              ok: true as const,
              result: {
                kind: "file",
                media_type: "text/plain",
                mode: "0644",
                modified_at: "2026-09-01T10:00:00Z",
                path: (params as { path: string }).path,
                size_bytes: 2_000_000,
              },
            })
          : Promise.resolve(refused("unknown")),
      agentStream: () =>
        Promise.resolve(
          refused("the file is too heavy: 2000000 bytes", "Download it.")
        ),
    });

    await useFiles.getState().show(SERVER, "projects/atlas/big.log");

    expect(useFiles.getState().preview).toMatchObject({
      error: { fix: "Download it." },
      stat: { size_bytes: 2_000_000 },
      status: "unreadable",
    });
  });

  it("descends into a folder rather than opening it on the right", async () => {
    await opened();

    await useFiles.getState().show(SERVER, "projects/atlas/src");

    expect(useFiles.getState().preview).toMatchObject({ status: "idle" });
    expect(useFiles.getState().listing).toMatchObject({
      path: "projects/atlas/src",
      status: "read",
    });
  });
});

describe("writing a file", () => {
  it("sends the digest read and keeps the one the agent returns for the next write", async () => {
    const agent = await opened();
    const read = await fingerprint(bytesOf(ENV));

    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");

    expect(useFiles.getState().draft).toBe("PORT=3100\n");

    await useFiles.getState().save(SERVER);

    expect(calls(agent, "fs.write").map((c) => c.params)).toEqual([
      {
        content: base64Of(bytesOf("PORT=3100\n")),
        path: "projects/atlas/.env",
        sha256: read,
      },
    ]);
    expect(useFiles.getState().preview).toMatchObject({
      sha256: "b".repeat(64),
      status: "text",
      text: "PORT=3100\n",
    });
    expect(useFiles.getState().draft).toBeNull();
    expect(useFiles.getState().write).toMatchObject({ status: "written" });
  });

  it("says the file changed when the agent refuses and the digest on the server differs", async () => {
    const agent: Agent = {
      calls: [],
      onServer: "c".repeat(64),
      write: () =>
        refused(
          "projects/atlas/.env has changed since it was read",
          "Read the file again with fs.read."
        ),
    };

    await opened(agent);
    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");
    await useFiles.getState().save(SERVER);

    expect(useFiles.getState().write).toMatchObject({
      error: { fix: "Read the file again with fs.read." },
      status: "stale",
    });
    expect(useFiles.getState().draft).toBe("PORT=3100\n");
    expect(calls(agent, "fs.stat").at(-1)?.params).toEqual({
      hash: true,
      path: "projects/atlas/.env",
    });
  });

  it("keeps an ordinary refusal as a failure, not as a changed file", async () => {
    await opened({
      calls: [],
      onServer: await fingerprint(bytesOf(ENV)),
      write: () => refused("the machine refused the write: disk full"),
    });
    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("x");
    await useFiles.getState().save(SERVER);

    expect(useFiles.getState().write).toMatchObject({ status: "failed" });
  });

  it("rereading loses the buffer and takes the server's text again", async () => {
    await opened();
    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");

    await useFiles.getState().reread(SERVER);

    expect(useFiles.getState().draft).toBeNull();
    expect(useFiles.getState().preview).toMatchObject({
      status: "text",
      text: ENV,
    });
  });

  it("holds a gesture that would leave a modified buffer until the reader decides", async () => {
    await opened();
    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");

    await useFiles.getState().browse(SERVER, "projects/atlas/src");

    expect(useFiles.getState().listing).toMatchObject({
      path: "projects/atlas",
    });
    expect(useFiles.getState().leaving).not.toBeNull();

    useFiles.getState().stay();

    expect(useFiles.getState().leaving).toBeNull();
    expect(useFiles.getState().draft).toBe("PORT=3100\n");

    await useFiles.getState().browse(SERVER, "projects/atlas/src");
    useFiles.getState().confirmLeave();
    await Promise.resolve();

    expect(useFiles.getState().draft).toBeNull();
  });

  it("keeps a root's modified buffer when moving to another, and returns it on the way back", async () => {
    await opened();
    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");

    await useFiles.getState().open(SERVER, null);

    expect(useFiles.getState().root).toBe("");
    expect(useFiles.getState().draft).toBeNull();
    expect(useFiles.getState().preview).toMatchObject({ status: "idle" });
    expect(useFiles.getState().leaving).toBeNull();

    await useFiles.getState().open(SERVER, "/home/dev/projects/atlas");

    expect(useFiles.getState().draft).toBe("PORT=3100\n");
    expect(useFiles.getState().preview).toMatchObject({
      path: "projects/atlas/.env",
      status: "text",
    });
    expect(useFiles.getState().listing).toMatchObject({
      path: "projects/atlas",
      status: "read",
    });
    expect(useFiles.getState().leaving).toBeNull();
  });

  it("keeps a server's modified buffer when switching servers, without writing it to the other", async () => {
    const agent = await opened();

    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");

    await useFiles.getState().open("srv-2", "/home/dev/projects/atlas");

    expect(useFiles.getState().serverId).toBe("srv-2");
    expect(useFiles.getState().draft).toBeNull();

    await useFiles.getState().save("srv-2");

    expect(calls(agent, "fs.write")).toHaveLength(0);

    await useFiles.getState().open(SERVER, "/home/dev/projects/atlas");

    expect(useFiles.getState().draft).toBe("PORT=3100\n");
  });

  it("returns to the same root without asking to abandon the buffer", async () => {
    await opened();
    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");

    await useFiles.getState().open(SERVER, "/home/dev/projects/atlas");

    expect(useFiles.getState().leaving).toBeNull();
    expect(useFiles.getState().draft).toBe("PORT=3100\n");
  });
});

describe("gestures on an entry", () => {
  it("renames within the same folder then rereads it", async () => {
    const agent = await opened();

    await useFiles
      .getState()
      .rename(SERVER, "projects/atlas/.env", ".env.local");

    expect(calls(agent, "fs.rename").map((c) => c.params)).toEqual([
      { path: "projects/atlas/.env", to: "projects/atlas/.env.local" },
    ]);
    expect(calls(agent, "fs.list")).toHaveLength(2);
  });

  it("returns a rename refusal to the gesture that asked for it, without rereading anything", async () => {
    const agent = await opened({
      calls: [],
      rename: () => refused("entrée déjà présente : projects/atlas/src"),
    });

    const refusal = await useFiles
      .getState()
      .rename(SERVER, "projects/atlas/.env", "src");

    expect(refusal).toMatchObject({
      message: "entrée déjà présente : projects/atlas/src",
    });
    expect(useFiles.getState().problem).toBeNull();
    expect(calls(agent, "fs.list")).toHaveLength(1);

    agent.rename = undefined;

    expect(
      await useFiles.getState().rename(SERVER, "projects/atlas/.env", "env")
    ).toBeNull();
  });

  it("follows an open file that was just renamed", async () => {
    await opened();
    await useFiles.getState().show(SERVER, "projects/atlas/.env");

    await useFiles.getState().rename(SERVER, "projects/atlas/.env", "env");

    expect(useFiles.getState().preview).toMatchObject({
      path: "projects/atlas/env",
      status: "text",
    });
  });

  it("keeps the refusal of a non-empty folder on the entry, then removes with recursive", async () => {
    const agent = await opened({ calls: [], held: 4 });

    await useFiles.getState().remove(SERVER, "projects/atlas/src");

    expect(useFiles.getState().removal).toMatchObject({
      error: {
        message: "the folder is not empty: projects/atlas/src holds 4 entries",
      },
      path: "projects/atlas/src",
    });
    expect(calls(agent, "fs.list")).toHaveLength(1);

    await useFiles.getState().remove(SERVER, "projects/atlas/src", true);

    expect(useFiles.getState().removal).toBeNull();
    expect(calls(agent, "fs.remove").at(-1)?.params).toEqual({
      path: "projects/atlas/src",
      recursive: true,
    });
    expect(calls(agent, "fs.list")).toHaveLength(2);
  });

  it("closes the open file when its folder goes, and rereads", async () => {
    await opened();
    await useFiles.getState().show(SERVER, "projects/atlas/src/index.ts");
    await useFiles.getState().browse(SERVER, "projects/atlas");

    await useFiles.getState().remove(SERVER, "projects/atlas/src", true);

    expect(useFiles.getState().preview).toMatchObject({ status: "idle" });
  });

  it("creates a folder inside the one on screen and rereads", async () => {
    const agent = await opened();

    await useFiles.getState().makeFolder(SERVER, "docs");

    expect(calls(agent, "fs.mkdir").map((c) => c.params)).toEqual([
      { path: "projects/atlas/docs" },
    ]);
    expect(calls(agent, "fs.list")).toHaveLength(2);
  });

  it("creates an empty file without a digest, rereads the folder and opens it", async () => {
    const agent = await opened();

    await useFiles.getState().makeFile(SERVER, "notes.md");

    expect(calls(agent, "fs.write").map((c) => c.params)).toEqual([
      { content: "", path: "projects/atlas/notes.md" },
    ]);
    expect(calls(agent, "fs.list")).toHaveLength(2);
    expect(useFiles.getState().preview).toMatchObject({
      path: "projects/atlas/notes.md",
      status: "text",
    });
    expect(useFiles.getState().view).toBe("source");
    expect(useFiles.getState().problem).toBeNull();
  });

  it("shows the refusal of a file that already exists and keeps what is open", async () => {
    const agent = await opened({
      calls: [],
      write: () =>
        refused("projects/atlas/.env existe déjà", "Choisissez un autre nom."),
    });
    await useFiles.getState().show(SERVER, "projects/atlas/.env");

    const refusal = await useFiles.getState().makeFile(SERVER, ".env");

    expect(refusal).toMatchObject({
      message: "projects/atlas/.env existe déjà",
    });
    expect(useFiles.getState().problem).toBeNull();
    expect(useFiles.getState().preview).toMatchObject({
      path: "projects/atlas/.env",
      status: "text",
    });
    expect(calls(agent, "fs.list")).toHaveLength(1);
  });

  it("creates the file but leaves the modified buffer on screen", async () => {
    await opened();
    await useFiles.getState().show(SERVER, "projects/atlas/.env");
    useFiles.getState().edit("PORT=3100\n");

    await useFiles.getState().makeFile(SERVER, "notes.md");

    expect(useFiles.getState().preview).toMatchObject({
      path: "projects/atlas/.env",
      status: "text",
    });
    expect(useFiles.getState().draft).toBe("PORT=3100\n");
    expect(useFiles.getState().leaving).toBeNull();
  });
});
