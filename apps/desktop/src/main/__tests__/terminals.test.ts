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

describe("le terminal d'un projet", () => {
  it("démarre dans le dossier absolu que le projet porte, sous tmux", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await shell("flymate-api", "tabc1", null, calls.terminals);

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-flymate-api-tabc1 -c /home/dev/projects/flymate/api ';' set-option -t shell-flymate-api-tabc1 status off",
        kind: "shell",
        session: "shell-flymate-api-tabc1",
      },
    });
  });

  it("ouvre le shell de connexion quand aucun projet n'est nommé", async () => {
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

  it("rattache la session que l'onglet remémoré porte, plutôt qu'une neuve", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await shell(
      "flymate-api",
      "tabc3",
      "shell-flymate-api-tabc1",
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-flymate-api-tabc1 -c /home/dev/projects/flymate/api ';' set-option -t shell-flymate-api-tabc1 status off",
        session: "shell-flymate-api-tabc1",
      },
    });
  });

  it("donne un nom que tmux accepte à un projet qui porte un point", async () => {
    const calls = deps();
    const named = await shell(null, "tab.4:x", null, calls.terminals);

    expect(named).toMatchObject({
      ok: true,
      result: { session: "shell-server-tab-4-x" },
    });
  });

  it("refuse un nom de session que l'app n'aurait jamais écrit", async () => {
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

  it("refuse un projet que l'agent n'a pas déclaré, même pour un simple shell", async () => {
    const calls = deps();

    const refused = await shell("jamais-vu", "tabc6", null, calls.terminals);

    expect(refused).toMatchObject({
      error: { code: "project_not_found" },
      ok: false,
    });
  });
});

describe("le terminal ouvert dans un sous-dossier", () => {
  it("recolle le dossier nommé sous celui du projet, jamais ailleurs", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await terminalCommand(
      {
        dir: "src/lib",
        id: "tabd1",
        kind: "shell",
        project: "flymate-api",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s shell-flymate-api-tabd1 -c /home/dev/projects/flymate/api/src/lib ';' set-option -t shell-flymate-api-tabd1 status off",
      },
    });
  });

  it("recolle un dossier du serveur sous la racine que l'agent a nommée", async () => {
    const calls = deps();

    const opened = await terminalCommand(
      {
        dir: "projects/flymate",
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
          "tmux new-session -A -s shell-server-tabd2 -c /home/dev/projects/flymate ';' set-option -t shell-server-tabd2 status off",
      },
    });
  });

  it("refuse un dossier qui remonte, un absolu, ou une forme qu'un shell lirait", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    for (const dir of ["../secrets", "src/../../etc", "/etc", "a b; rm", ""]) {
      const refused = await terminalCommand(
        {
          dir,
          id: "tabd3",
          kind: "shell",
          project: "flymate-api",
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

  it("refuse un dossier du serveur quand l'agent n'a pas nommé sa racine", async () => {
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

describe("l'onglet d'un agent", () => {
  it("attache la commande que l'agent a rendue, et retient sa session", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await terminalCommand(
      {
        id: "tag1",
        kind: "claude",
        project: "flymate-api",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command:
          "tmux new-session -A -s claude-flymate-api -c /home/dev/projects/flymate/api claude",
        kind: "claude",
        session: "claude-flymate-api",
      },
    });
  });

  it("transmet le refus de l'agent et son remède, sans les toucher", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);
    await terminalCommand(
      {
        id: "tag2",
        kind: "claude",
        project: "flymate-api",
        serverId: SERVER,
        session: null,
      },
      calls.terminals
    );

    const refused = await terminalCommand(
      {
        id: "tag3",
        kind: "hermes",
        project: "flymate-api",
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

  it("refuse un projet que l'agent n'a jamais déclaré, sans rien lui demander", async () => {
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

  it("refuse un genre que le protocole ne connaît pas", async () => {
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

  it("refuse un serveur qui n'est plus dans la liste", async () => {
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
