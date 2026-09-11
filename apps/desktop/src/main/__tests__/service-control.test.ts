import { afterEach, describe, expect, it } from "bun:test";
import { type AgentClient, createAgentClient } from "../agent-client";
import {
  databaseShellCommand,
  forgetShells,
  quoted,
  releaseShell,
  reserveDatabaseShell,
  reservedShell,
} from "../db-shell";
import { type ServicesDeps, serviceLogs } from "../services-run";
import { type FakeAgent, fakeAgent } from "./fixtures/fake-agent";

const SERVER = "srv-1";

let fake: FakeAgent | null = null;

function deps(fixture: string): ServicesDeps {
  fake = fakeAgent(fixture);

  const client: AgentClient = createAgentClient({
    appVersion: "0.1.0",
    backoff: { attempts: 1 },
    spawn: fake.spawn,
  });

  return { client, knows: (id) => id === SERVER };
}

afterEach(() => {
  fake?.killAll();
  fake = null;
  forgetShells();
});

describe("le journal d'un service", () => {
  it("suit l'unité que le renderer a nommée, ligne par ligne", async () => {
    const lines: string[] = [];

    const answer = await serviceLogs(
      SERVER,
      "db.postgres",
      undefined,
      true,
      (line) => lines.push(line),
      deps("service-logs-work.jsonl")
    );

    expect(answer.ok).toBe(true);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("ready to accept connections");
  });

  it("refuse un serveur inconnu et un module sans nom sans toucher au canal", async () => {
    const calls = deps("service-logs-work.jsonl");

    const unknown = await serviceLogs(
      "srv-9",
      "db.postgres",
      120,
      false,
      () => undefined,
      calls
    );
    const nameless = await serviceLogs(
      SERVER,
      "",
      120,
      false,
      () => undefined,
      calls
    );

    expect(unknown.ok).toBe(false);
    expect(nameless.ok).toBe(false);
    expect(fake?.started()).toBe(0);
  });
});

describe("le shell d'une base dans un onglet", () => {
  it("prend la commande que l'agent rend et la tient sous l'identifiant de l'onglet", async () => {
    const calls = deps("db-shell-control.jsonl");

    const opened = await reserveDatabaseShell(
      SERVER,
      "db.postgres",
      null,
      calls
    );

    expect(opened.ok).toBe(true);

    if (!opened.ok) {
      return;
    }

    const held = reservedShell(opened.result.id, SERVER);

    expect(opened.result.session).toMatch(/^db-postgres-\d+$/);
    expect(held?.kind).toBe("shell");
    expect(held?.command).toBe(
      `tmux new-session -A -s ${opened.result.session} 'sudo -u postgres psql app' ';' set-option -t ${opened.result.session} status off`
    );
  });

  it("ne rend la commande qu'au serveur qui l'a demandée, et l'oublie avec l'onglet", async () => {
    const calls = deps("db-shell-control.jsonl");

    const opened = await reserveDatabaseShell(
      SERVER,
      "db.postgres",
      null,
      calls
    );
    const id = opened.ok ? opened.result.id : "";

    expect(reservedShell(id, "srv-9")).toBeNull();
    expect(reservedShell("t-autre", SERVER)).toBeNull();

    releaseShell(id);

    expect(reservedShell(id, SERVER)).toBeNull();
  });

  it("refuse un module qui n'est pas une base et un nom qui ne peut pas en nommer une", async () => {
    const calls = deps("db-shell-control.jsonl");

    const runtime = await reserveDatabaseShell(
      SERVER,
      "runtime.node",
      null,
      calls
    );
    const name = await reserveDatabaseShell(
      SERVER,
      "db.postgres",
      "shop; rm -rf /",
      calls
    );

    expect(runtime.ok).toBe(false);
    expect(runtime.ok || runtime.error.phrase?.id).toBe(
      "refusal.module.notDatabase"
    );
    expect(name.ok).toBe(false);
    expect(name.ok || name.error.phrase?.id).toBe("refusal.database.name");
    expect(fake?.started()).toBe(0);
  });

  it("cite la ligne de l'agent en un seul argument, apostrophe comprise", () => {
    expect(quoted("sudo -u postgres psql it's-shop")).toBe(
      "'sudo -u postgres psql it'\\''s-shop'"
    );
    expect(databaseShellCommand("db-mysql-2", "sudo mysql shop").command).toBe(
      "tmux new-session -A -s db-mysql-2 'sudo mysql shop' ';' set-option -t db-mysql-2 status off"
    );
  });
});
