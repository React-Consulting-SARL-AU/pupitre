import type { DbEngine } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentResponse } from "@shared/agent";
import { type DatabaseShell, databaseEngineOf } from "@shared/services";
import { refuseWith } from "./refusal";
import {
  isServiceRefusal,
  namedService,
  type ServicesDeps,
} from "./services-run";
import type { TerminalCommand } from "./terminal-run";

const DATABASE_OK = /^[A-Za-z0-9_-]{1,64}$/;

/** A second line would be a second command. */
const ONE_LINE = /^[^\r\n\0]+$/;

interface Reserved extends TerminalCommand {
  serverId: string;
}

/** Held by tab id so `terminal-open` runs the agent's command and nothing the renderer sends can replace it. */
const reserved = new Map<string, Reserved>();

let counter = 0;

export function quoted(command: string): string {
  return `'${command.replaceAll("'", "'\\''")}'`;
}

export function databaseSession(engine: DbEngine, rank: number): string {
  return `db-${engine}-${rank}`;
}

export function databaseShellCommand(
  session: string,
  command: string
): TerminalCommand {
  return {
    command: [
      "tmux",
      "new-session",
      "-A",
      "-s",
      session,
      quoted(command),
      "';'",
      "set-option",
      "-t",
      session,
      "status",
      "off",
    ].join(" "),
    kind: "shell",
    session,
  };
}

function databaseOf(name: unknown): string | null | AgentResponse<never> {
  if (name === null || name === undefined || name === "") {
    return null;
  }

  return typeof name === "string" && DATABASE_OK.test(name)
    ? name
    : refuseWith("bad_request", "refusal.database.name", {
        name: String(name),
      });
}

export async function reserveDatabaseShell(
  serverId: unknown,
  moduleId: unknown,
  name: unknown,
  deps: ServicesDeps
): Promise<AgentResponse<DatabaseShell>> {
  const call = namedService(serverId, moduleId, deps);

  if (isServiceRefusal(call)) {
    return call;
  }

  const engine = databaseEngineOf(call.moduleId);

  if (!engine) {
    return refuseWith("bad_request", "refusal.module.notDatabase", {
      module: call.moduleId,
    });
  }

  const database = databaseOf(name);

  if (database !== null && typeof database !== "string") {
    return database;
  }

  const answer = await deps.client.request(call.serverId, "db.shell", {
    engine,
    ...(database ? { name: database } : {}),
  });

  if (!answer.ok) {
    return answer;
  }

  if (!ONE_LINE.test(answer.result.command)) {
    return refuseWith("internal", "refusal.database.command");
  }

  counter += 1;

  const id = `db${counter.toString(36)}${Date.now().toString(36)}`;
  const session = databaseSession(engine, counter);

  reserved.set(id, {
    ...databaseShellCommand(session, answer.result.command),
    serverId: call.serverId,
  });

  return { ok: true, result: { id, session } };
}

export function reservedShell(
  id: unknown,
  serverId: unknown
): TerminalCommand | null {
  const held = typeof id === "string" ? reserved.get(id) : undefined;

  if (!held || held.serverId !== serverId) {
    return null;
  }

  return { command: held.command, kind: held.kind, session: held.session };
}

export function releaseShell(id: unknown): void {
  if (typeof id === "string") {
    reserved.delete(id);
  }
}

export function forgetShells(serverId?: string): void {
  for (const [id, held] of reserved) {
    if (!serverId || held.serverId === serverId) {
      reserved.delete(id);
    }
  }
}
