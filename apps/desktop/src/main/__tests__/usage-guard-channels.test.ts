import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import type { AccountResponse, UsageRight } from "@shared/account";
import type { CarriedRelease } from "../agent-binary";
import {
  type AgentClient,
  createAgentClient,
  type UsageGate,
} from "../agent-client";
import {
  type AgentUpdateDeps,
  runAgentUpgrade,
  runModuleUpgrade,
} from "../agent-update-run";
import {
  actOnProject,
  checkoutProject,
  forgetProjects,
  listProjects,
  onProject,
  type ProjectDeps,
} from "../projects-run";
import { type TerminalDeps, terminalCommand } from "../terminal-run";
import { usageError } from "../usage-guard";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "srv-1";

const REFUSAL = {
  code: "license_required",
  fix: "Connecte-toi depuis les réglages, ou ouvre la console : https://app.pupitre.test/dashboard",
  message: "Installer un serveur demande un compte Pupitre.",
};

const ABSENT: AccountResponse<UsageRight> = { ok: false, error: REFUSAL };

const REFUSED = { ok: false, error: REFUSAL };

const gate: UsageGate = () => usageError(() => ABSENT);

let agent: FakeAgent | null = null;

function client(fixture = "restricted.jsonl"): AgentClient {
  agent = fakeAgent(fixture);

  return createAgentClient({ appVersion: "0.1.0", gate, spawn: agent.spawn });
}

function projectDeps(fixture?: string): ProjectDeps {
  return { client: client(fixture), knows: (id) => id === SERVER };
}

function release(): CarriedRelease {
  return {
    agent: {
      arch: "amd64",
      notes: [],
      signed: true,
      version: "0.4.0",
    },
    signature: "c2lnbmF0dXJlLWVkMjU1MTktZGUtdGVzdA==",
  };
}

function updateDeps(current: AgentClient): AgentUpdateDeps {
  return {
    appVersion: "0.1.0",
    carried: () => release(),
    client: current,
    published: () =>
      Promise.resolve({
        ok: false,
        error: { code: "release_not_found", message: "aucune version publiée" },
      }),
    declared: () => Promise.resolve({ ok: true, result: ["db.postgres"] }),
    probe: () =>
      Promise.resolve({
        ok: false,
        error: { code: "internal", message: "pas de sonde dans ce test" },
      }),
  };
}

beforeEach(() => {
  forgetProjects();
});

afterEach(() => {
  agent?.killAll();
  agent = null;
});

describe("project:act", () => {
  it("refuses to stop a project and does not launch the agent", async () => {
    const deps = projectDeps();

    const stopped = await actOnProject(
      "project.down",
      SERVER,
      "all",
      null,
      deps
    );

    expect(stopped).toMatchObject(REFUSED);
    expect(agent?.started()).toBe(0);
    expect(agent?.written()).toEqual([]);
  });

  it("also refuses to start and restart", async () => {
    const deps = projectDeps();

    const started = await actOnProject("project.up", SERVER, "all", null, deps);
    const restarted = await actOnProject(
      "project.restart",
      SERVER,
      "all",
      null,
      deps
    );

    expect(started).toMatchObject(REFUSED);
    expect(restarted).toMatchObject(REFUSED);
    expect(agent?.started()).toBe(0);
  });
});

describe("project:on and project:checkout", () => {
  it("lets the list be read, then refuses to touch it", async () => {
    const deps = projectDeps("usage-guard-projects.jsonl");

    const listed = await listProjects(SERVER, deps);

    expect(listed.ok && listed.result.projects[0]?.name).toBe("api");

    const removed = await onProject("project.remove", SERVER, "api", deps);
    const checked = await checkoutProject(SERVER, "api", "main", deps);

    expect(removed).toMatchObject(REFUSED);
    expect(checked).toMatchObject(REFUSED);
    expect(agent?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=project.list"]);

    (deps.client as AgentClient).closeAll();
  });
});

describe("install", () => {
  it("refuses the install, and the secret never leaves the app", async () => {
    const guarded = client();

    const installed = await guarded.request(
      SERVER,
      "install",
      { modules: ["tool.github"], config: {}, defer: [], secrets_stdin: true },
      { secrets: { "tool.github": { token: "ghp_de_test" } } }
    );

    expect(installed).toMatchObject(REFUSED);
    expect(agent?.started()).toBe(0);
    expect(agent?.written()).toEqual([]);
  });
});

describe("service:*", () => {
  it("refuses uninstalling, and dumping or importing a database", async () => {
    const guarded = client();

    const removed = await guarded.request(SERVER, "uninstall", {
      modules: ["db.postgres"],
    });
    const dumped = await guarded.request(SERVER, "db.dump", {
      engine: "postgres",
      name: "api",
    });
    const imported = await guarded.request(SERVER, "db.import", {
      engine: "postgres",
      name: "api",
    });

    expect(removed).toMatchObject(REFUSED);
    expect(dumped).toMatchObject(REFUSED);
    expect(imported).toMatchObject(REFUSED);
    expect(agent?.started()).toBe(0);
  });
});

describe("terminal-open", () => {
  it("refuses to open an agent session on the server", async () => {
    const deps: TerminalDeps = {
      client: client(),
      declares: () => true,
      folder: () => "/home/dev/projects/api",
      knows: (id) => id === SERVER,
    };

    const opened = await terminalCommand(
      {
        id: "t1",
        kind: "claude",
        project: "api",
        serverId: SERVER,
        session: null,
      },
      deps
    );

    expect(opened).toMatchObject(REFUSED);
    expect(agent?.started()).toBe(0);
  });

  it("always lets a shell open, since it asks the agent for nothing", async () => {
    const deps: TerminalDeps = {
      client: client(),
      declares: () => true,
      folder: () => "/home/dev/projects/api",
      knows: (id) => id === SERVER,
    };

    const opened = await terminalCommand(
      {
        id: "t2",
        kind: "shell",
        project: "api",
        serverId: SERVER,
        session: null,
      },
      deps
    );

    expect(opened).toMatchObject({ ok: true, result: { kind: "shell" } });
    expect(agent?.started()).toBe(0);
  });
});

describe("agent-update:*", () => {
  it("refuses the module update without sending anything", async () => {
    const guarded = client();

    const upgraded = await runModuleUpgrade(
      SERVER,
      ["db.postgres"],
      () => undefined,
      updateDeps(guarded)
    );

    expect(upgraded).toMatchObject(REFUSED);
    expect(agent?.started()).toBe(0);
  });

  it("reads the machine then refuses to replace the agent binary", async () => {
    const guarded = client();

    const upgraded = await runAgentUpgrade(
      SERVER,
      () => undefined,
      updateDeps(guarded)
    );

    expect(upgraded).toMatchObject(REFUSED);
    expect(agent?.trace()).toEqual(["id=1 cmd=hello", "id=2 cmd=snapshot"]);

    guarded.closeAll();
  });
});
