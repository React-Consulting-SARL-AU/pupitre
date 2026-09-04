import type { DbEngine } from "@pupitre/shared/agent-protocol/secrets";
import type { ServiceStatusResult } from "@pupitre/shared/agent-protocol/state";
import type { AgentResponse } from "@shared/agent";
import {
  CONNECTION_LABEL,
  databaseEngineOf,
  type ServiceDetail,
} from "@shared/services";
import type { AgentClient } from "./agent-client";

/**
 * A service as the screen reads it, and its credentials as nobody reads them.
 *
 * `service.status` and `db.url` answer with what opens a database. Those values
 * stop here: the renderer is told which credentials exist, by the labels the
 * agent gave them, and asks for one at a time when the reader clicks. Nothing
 * of them is written to a file, a store or a log — this module never prints,
 * and the vault dies with the connection.
 */

export interface ServicesDeps {
  client: Pick<AgentClient, "request">;
  /** Whether this identifier still names a server of the app's configuration. */
  knows: (serverId: string) => boolean;
}

const vaults = new Map<string, Map<string, Map<string, string>>>();

function held(serverId: string, moduleId: string): Map<string, string> {
  const server = vaults.get(serverId) ?? new Map<string, Map<string, string>>();
  vaults.set(serverId, server);

  const module = server.get(moduleId) ?? new Map<string, string>();
  server.set(moduleId, module);

  return module;
}

function unknownServer(): AgentResponse<never> {
  return {
    ok: false,
    error: {
      code: "bad_request",
      message: "Ce serveur n'est plus dans la liste.",
      fix: "Choisis un serveur dans les réglages.",
    },
  };
}

function refuse(message: string, fix: string): AgentResponse<never> {
  return { ok: false, error: { code: "bad_request", fix, message } };
}

function named(
  serverId: unknown,
  moduleId: unknown,
  deps: ServicesDeps
): { serverId: string; moduleId: string } | AgentResponse<never> {
  if (typeof serverId !== "string" || !deps.knows(serverId)) {
    return unknownServer();
  }

  if (typeof moduleId !== "string" || moduleId.length === 0) {
    return refuse(
      "Ce module n'a pas de nom.",
      "Choisis un service dans la liste."
    );
  }

  return { moduleId, serverId };
}

function isRefusal<T>(
  value: T | AgentResponse<never>
): value is AgentResponse<never> {
  return typeof value === "object" && value !== null && "ok" in value;
}

function detailOf(
  status: ServiceStatusResult,
  vault: Map<string, string>
): ServiceDetail {
  return {
    credentials: [...vault.keys()],
    id: status.id,
    name: status.name,
    state: status.state,
    ...(status.version === undefined ? {} : { version: status.version }),
    ...(status.port === undefined ? {} : { port: status.port }),
    ...(status.unit === undefined ? {} : { unit: status.unit }),
  };
}

/**
 * The state of one module, asked of the agent that installed it.
 *
 * The credentials it answers with are put away on arrival; what comes back from
 * here carries their labels alone.
 */
export async function readService(
  serverId: unknown,
  moduleId: unknown,
  deps: ServicesDeps
): Promise<AgentResponse<ServiceDetail>> {
  const call = named(serverId, moduleId, deps);

  if (isRefusal(call)) {
    return call;
  }

  const answer = await deps.client.request(call.serverId, "service.status", {
    id: call.moduleId,
  });

  if (!answer.ok) {
    return answer;
  }

  const vault = held(call.serverId, call.moduleId);

  for (const [label, value] of Object.entries(
    answer.result.credentials ?? {}
  )) {
    vault.set(label, value);
  }

  return { ok: true, result: detailOf(answer.result, vault) };
}

/**
 * The connection string of a database, filed with its other credentials.
 *
 * The engine is read from the module's own identifier rather than taken from
 * the interface: the renderer names a service, and what that service is stays
 * the catalogue's business.
 */
export async function readDatabaseUrl(
  serverId: unknown,
  moduleId: unknown,
  name: unknown,
  deps: ServicesDeps
): Promise<AgentResponse<{ label: string }>> {
  const call = named(serverId, moduleId, deps);

  if (isRefusal(call)) {
    return call;
  }

  const engine: DbEngine | null = databaseEngineOf(call.moduleId);

  if (!engine) {
    return refuse(
      `${call.moduleId} n'est pas une base de données.`,
      "Cette action n'existe que pour les modules de la catégorie « bases de données »."
    );
  }

  const answer = await deps.client.request(call.serverId, "db.url", {
    engine,
    ...(typeof name === "string" && name.length > 0 ? { name } : {}),
  });

  if (!answer.ok) {
    return answer;
  }

  held(call.serverId, call.moduleId).set(CONNECTION_LABEL, answer.result.url);

  return { ok: true, result: { label: CONNECTION_LABEL } };
}

/** One credential, on demand. The caller shows it and lets it go. */
export function credentialValue(
  serverId: unknown,
  moduleId: unknown,
  label: unknown
): string | null {
  if (
    typeof serverId !== "string" ||
    typeof moduleId !== "string" ||
    typeof label !== "string"
  ) {
    return null;
  }

  return vaults.get(serverId)?.get(moduleId)?.get(label) ?? null;
}

export function forgetCredentials(serverId?: string, moduleId?: string): void {
  if (!serverId) {
    vaults.clear();

    return;
  }

  if (moduleId) {
    vaults.get(serverId)?.delete(moduleId);

    return;
  }

  vaults.delete(serverId);
}
