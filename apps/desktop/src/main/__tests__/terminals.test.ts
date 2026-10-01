import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  declaresProject,
  forgetProjects,
  listProjects,
  type ProjectDeps,
  projectFolder,
  projectPath,
} from "../projects-run";
import { type TerminalDeps, terminalCommand } from "../terminal-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "srv-1";

let fake: FakeAgent | null = null;

function deps(): { terminals: TerminalDeps; projects: ProjectDeps } {
  fake = fakeAgent("terminals-control.jsonl");

  const client: AgentClient = createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 1 },
    spawn: fake.spawn,
  });

  const knows = (id: string) => id === SERVER;

  return {
    projects: { client, knows },
    terminals: {
      client,
      declares: declaresProject,
      folder: projectFolder,
      knows,
      path: projectPath,
      root: () => Promise.resolve("/home/dev"),
    },
  };
}

beforeEach(() => {
  forgetProjects();
});

afterEach(() => {
  fake?.killAll();
  fake = null;
  forgetProjects();
});

function shell(
  project: string | null,
  id: string,
  session: string | null,
  calls: TerminalDeps
) {
  return terminalCommand(
    { id, kind: "shell", project, serverId: SERVER, session },
    calls
  );
}

describe("a project's terminal", () => {
  it("starts in the absolute folder the project carries, under tmux", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await shell("flyleaf-api", "tabc1", null, calls.terminals);

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-flyleaf-api-tabc1 -c /home/dev/projects/flyleaf/api ';' set-option -t shell-flyleaf-api-tabc1 status off",
        kind: "shell",
        session: "shell-flyleaf-api-tabc1",
      },
    });
  });

  it("opens the login shell when no project is named", async () => {
    const calls = deps();

    const opened = await shell(null, "tabc2", null, calls.terminals);

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-server-tabc2 ';' set-option -t shell-server-tabc2 status off",
        session: "shell-server-tabc2",
      },
    });
    expect(fake?.started()).toBe(0);
  });

  it("attaches to the session the remembered tab carries, rather than a new one", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await shell(
      "flyleaf-api",
      "tabc3",
      "shell-flyleaf-api-tabc1",
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-flyleaf-api-tabc1 -c /home/dev/projects/flyleaf/api ';' set-option -t shell-flyleaf-api-tabc1 status off",
        session: "shell-flyleaf-api-tabc1",
      },
    });
  });

  it("gives a name tmux accepts to a project whose name contains a dot", async () => {
    const calls = deps();
    const named = await shell(null, "tab.4:x", null, calls.terminals);

    expect(named).toMatchObject({
      ok: true,
      result: { session: "shell-server-tab-4-x" },
    });
  });

  it("refuses a session name the app would never have written", async () => {
    const calls = deps();

    const refused = await shell(
      null,
      "tabc5",
      "shell; rm -rf /",
      calls.terminals
    );

    expect(refused).toMatchObject({
      error: {
        code: "bad_request",
        phrase: { id: "refusal.terminal.session" },
      },
      ok: false,
    });
    expect(fake?.started()).toBe(0);
  });

  it("refuses a project the agent has not declared, even for a plain shell", async () => {
    const calls = deps();

    const refused = await shell("jamais-vu", "tabc6", null, calls.terminals);

    expect(refused).toMatchObject({
      error: { code: "project_not_found" },
      ok: false,
    });
  });
});

describe("a terminal opened in a subfolder", () => {
  it("joins the named folder under the project's, never elsewhere", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await terminalCommand(
      {
        dir: "src/lib",
        id: "tabd1",
        kind: "shell",
        project: "flyleaf-api",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-flyleaf-api-tabd1 -c /home/dev/projects/flyleaf/api/src/lib ';' set-option -t shell-flyleaf-api-tabd1 status off",
      },
    });
  });

  it("joins a server folder under the root the agent named", async () => {
    const calls = deps();

    const opened = await terminalCommand(
      {
        dir: "projects/flyleaf",
        id: "tabd2",
        kind: "shell",
        project: null,
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-server-tabd2 -c /home/dev/projects/flyleaf ';' set-option -t shell-server-tabd2 status off",
      },
    });
  });

  it("refuses a folder that climbs up, an absolute one, or a form a shell would interpret", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    for (const dir of ["../secrets", "src/../../etc", "/etc", "a b; rm", ""]) {
      const refused = await terminalCommand(
        {
          dir,
          id: "tabd3",
          kind: "shell",
          project: "flyleaf-api",
          serverId: SERVER,
          session: null,
        },
        calls.terminals
      );

      expect(refused).toMatchObject({
        error: {
          code: "bad_request",
          phrase: { id: "refusal.terminal.folder" },
        },
        ok: false,
      });
    }
  });

  it("refuses a server folder when the agent did not name its root", async () => {
    const calls = deps();

    const refused = await terminalCommand(
      {
        dir: "projects",
        id: "tabd4",
        kind: "shell",
        project: null,
        serverId: SERVER,
        session: null,
      },
      { ...calls.terminals, root: () => Promise.resolve(null) }
    );

    expect(refused).toMatchObject({
      error: { phrase: { id: "refusal.terminal.folder" } },
      ok: false,
    });
  });
});

describe("an agent's tab", () => {
  it("attaches the command the agent returned, and remembers its session", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await terminalCommand(
      {
        id: "tag1",
        kind: "claude",
        project: "flyleaf-api",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s claude-flyleaf-api -c /home/dev/projects/flyleaf/api claude",
        kind: "claude",
        session: "claude-flyleaf-api",
      },
    });
  });

  it("relays the agent's refusal and its fix untouched", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);
    await terminalCommand(
      {
        id: "tag2",
        kind: "claude",
        project: "flyleaf-api",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    const refused = await terminalCommand(
      {
        id: "tag3",
        kind: "hermes",
        project: "flyleaf-api",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(refused).toMatchObject({
      error: {
        code: "module_not_found",
        fix: "Ajoute le module ai.hermes depuis l'écran Services.",
      },
      ok: false,
    });
  });

  it("refuses a project the agent never declared, without asking it anything", async () => {
    const calls = deps();

    const refused = await terminalCommand(
      {
        id: "tag4",
        kind: "claude",
        project: "jamais-vu",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(refused).toMatchObject({
      error: { code: "project_not_found" },
      ok: false,
    });
    expect(fake?.started()).toBe(0);
  });

  it("refuses a kind the protocol does not know", async () => {
    const calls = deps();

    const refused = await terminalCommand(
      {
        id: "tag5",
        kind: "bash -c 'rm -rf /'",
        project: null,
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(refused).toMatchObject({
      error: { code: "bad_request" },
      ok: false,
    });
    expect(fake?.started()).toBe(0);
  });

  it("refuses a server that is no longer in the list", async () => {
    const calls = deps();

    const refused = await terminalCommand(
      {
        id: "tag6",
        kind: "shell",
        project: null,
        serverId: "srv-parti",
        session: null,
      },
      calls.terminals
    );

    expect(refused).toMatchObject({
      error: { code: "bad_request" },
      ok: false,
    });
  });
});
