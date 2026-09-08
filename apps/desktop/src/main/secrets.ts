import type { SecretsStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { DoneResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentResponse } from "@shared/agent";
import { ipcMain } from "electron";
import { agentClient } from "./agent";
import { refuseWith } from "./refusal";
import { byId } from "./servers";

/**
 * The server's environment keys, and the one way a value reaches them.
 *
 * A value crosses the bridge once, on its way in, and is written straight onto
 * the protocol's secret line — never into `params`, never into a store, never
 * into a log. What comes back says the key is in place, and nothing else.
 */

const KEY_OK = /^[A-Z][A-Z0-9_]{1,60}$/;

const NEWLINE = /[\r\n]/;

function refuse(
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith("bad_request", id, values);
}

/** The keys the agent itself named, so a key typed here goes nowhere. */
const named = new Map<string, Set<string>>();

export async function readSecrets(
  serverId: unknown
): Promise<AgentResponse<SecretsStatusResult>> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return refuse("refusal.server.unknown");
  }

  const answer = await agentClient.request(serverId, "secrets.status");

  if (answer.ok) {
    named.set(
      serverId,
      new Set(answer.result.secrets.map((secret) => secret.key))
    );
  }

  return answer;
}

export async function writeSecret(
  serverId: unknown,
  key: unknown,
  value: unknown
): Promise<AgentResponse<DoneResult>> {
  if (typeof serverId !== "string" || !byId(serverId)) {
    return refuse("refusal.server.unknown");
  }

  if (typeof key !== "string" || !KEY_OK.test(key)) {
    return refuse("refusal.secret.unknown", { key: String(key) });
  }

  if (!named.get(serverId)?.has(key)) {
    return refuse("refusal.secrets.stale", { key });
  }

  // A multi-line value would be truncated at the first line on the server, and
  // the rest would be read as further lines of the environment file.
  if (typeof value !== "string" || value.length === 0 || NEWLINE.test(value)) {
    return refuse("refusal.secret.value.invalid");
  }

  return await agentClient.request(
    serverId,
    "secrets.set",
    { key, secrets_stdin: true },
    { secrets: { [key]: value } }
  );
}

export function registerSecrets(): void {
  ipcMain.handle("secrets:status", (_event, serverId: unknown) =>
    readSecrets(serverId)
  );

  ipcMain.handle(
    "secrets:set",
    (_event, serverId: unknown, key: unknown, value: unknown) =>
      writeSecret(serverId, key, value)
  );
}
