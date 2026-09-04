import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  declaresProject,
  forgetProjects,
  listProjects,
  type ProjectDeps,
  projectFolder,
} from "../projects-run";
import { authorizationCode, loginAddress } from "../terminal-links";
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

describe("le terminal d'un projet", () => {
  it("démarre dans le dossier absolu que le projet porte, sans passer par git", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await terminalCommand(
      SERVER,
      "shell",
      "flymate-api",
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: {
        command: "cd '/home/dev/projects/flymate/api' && exec $SHELL -l",
        session: null,
      },
    });
  });

  it("ouvre le shell de connexion quand aucun projet n'est nommé", async () => {
    const calls = deps();

    const opened = await terminalCommand(
      SERVER,
      "shell",
      null,
      calls.terminals
    );

    expect(opened).toMatchObject({
      ok: true,
      result: { command: "exec $SHELL -l" },
    });
    expect(fake?.started()).toBe(0);
  });
});

describe("l'onglet d'un agent", () => {
  it("attache la commande que l'agent a rendue, et retient sa session", async () => {
    const calls = deps();

    await listProjects(SERVER, calls.projects);

    const opened = await terminalCommand(
      SERVER,
      "claude",
      "flymate-api",
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
    await terminalCommand(SERVER, "claude", "flymate-api", calls.terminals);

    const refused = await terminalCommand(
      SERVER,
      "hermes",
      "flymate-api",
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
      SERVER,
      "claude",
      "jamais-vu",
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
      SERVER,
      "bash -c 'rm -rf /'",
      null,
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
      "srv-parti",
      "shell",
      null,
      calls.terminals
    );

    expect(refused).toMatchObject({
      error: { code: "bad_request" },
      ok: false,
    });
  });
});

describe("l'adresse de connexion d'un agent", () => {
  it("la reconnaît au milieu de ce que l'agent dessine", () => {
    const drawn =
      "\u001b[2mOuvre\u001b[0m https://claude.ai/oauth/authorize?code=true&state=abc\u001b[0m\r\n";

    expect(loginAddress(drawn)).toMatchObject({ host: "claude.ai" });
  });

  it("garde la dernière quand l'agent en réimprime une", () => {
    const twice =
      "https://claude.ai/oauth/authorize?state=un\nhttps://claude.ai/oauth/authorize?state=deux";

    expect(loginAddress(twice)?.url).toContain("state=deux");
  });

  it("n'en fait pas une d'une adresse quelconque", () => {
    expect(loginAddress("https://exemple.test/connexion")).toBeNull();
    expect(loginAddress("Rien à ouvrir ici.")).toBeNull();
  });

  it("lit le code du retour, même sur un port du serveur", () => {
    expect(
      authorizationCode(
        "http://localhost:54545/callback?code=ac_9f2b7d41&state=x"
      )
    ).toBe("ac_9f2b7d41");
    expect(authorizationCode("https://claude.ai/oauth/authorize")).toBeNull();
  });

  it("ne prend pas le code=true de l'adresse d'ouverture pour une réponse", () => {
    expect(
      authorizationCode("https://claude.ai/oauth/authorize?code=true&state=x")
    ).toBeNull();
  });
});
