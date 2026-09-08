import type { DbEngine } from "@pupitre/shared/agent-protocol/secrets";
import type { ServiceStatusResult } from "@pupitre/shared/agent-protocol/state";
import type { AgentResponse } from "@shared/agent";
import {
  CONNECTION_LABEL,
  databaseEngineOf,
  type ServiceDetail,
} from "@shared/services";
import type { AgentClient } from "./agent-client";
import { refusalOf, refuseWith } from "./refusal";

/**
 * A service as the screen reads it, and its credentials as nobody reads them.
 *
 * `service.status` names the credentials of a module: a label, and the key of
 * `/etc/pupitre/env` that holds it. The value is asked for one at a time, on
 * `service.secret`, at the moment the reader clicks — it arrives on its own
 * event, is handed to the caller, and is kept nowhere. `db.url` is the one that
 * answers with a value rather than a key, and that value stops here too.
 */

export interface ServicesDeps {
  client: Pick<AgentClient, "request">;
  /** Whether this identifier still names a server of the app's configuration. */
  knows: (serverId: string) => boolean;
}

/** What the app holds for a credential: the key that names it, or the value. */
type Held = { key: string } | { value: string };

const vaults = new Map<string, Map<string, Map<string, Held>>>();

function held(serverId: string, moduleId: string): Map<string, Held> {
  const server = vaults.get(serverId) ?? new Map<string, Map<string, Held>>();
  vaults.set(serverId, server);

  const module = server.get(moduleId) ?? new Map<string, Held>();
  server.set(moduleId, module);

  return module;
}

function unknownServer(): AgentResponse<never> {
  return {
    ok: false,
    error: {
      ...refusalOf("bad_request", "refusal.server.unknown"),
    },
  };
}

function refuse(
  id: string,
  values?: Record<string, string | number>
): AgentResponse<never> {
  return refuseWith("bad_request", id, values);
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
    return refuse("refusal.module.none");
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
  vault: Map<string, Held>
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
 * The credentials it answers with name keys of the server's environment; what
 * comes back from here carries their labels alone.
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

  // Labels are the agent's, in the session's language: keeping the ones it no
  // longer names would list the same credential twice after a language change.
  for (const [label, entry] of vault) {
    if ("key" in entry) {
      vault.delete(label);
    }
  }

  for (const [label, key] of Object.entries(answer.result.credentials ?? {})) {
    vault.set(label, { key });
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
    return refuse("refusal.module.notDatabase", { module: call.moduleId });
  }

  const answer = await deps.client.request(call.serverId, "db.url", {
    engine,
    ...(typeof name === "string" && name.length > 0 ? { name } : {}),
  });

  if (!answer.ok) {
    return answer;
  }

  held(call.serverId, call.moduleId).set(CONNECTION_LABEL, {
    value: answer.result.url,
  });

  return { ok: true, result: { label: CONNECTION_LABEL } };
}

/**
 * The value of one key, asked of the agent that holds it.
 *
 * It comes back on the protocol's `secret` event rather than in the result, so
 * nothing that a request-and-answer recorder captures ever carries it. It is
 * handed to the caller and to nobody else: a second reveal asks again.
 */
async function revealed(
  serverId: string,
  moduleId: string,
  key: string,
  deps: ServicesDeps
): Promise<string | null> {
  const seen: { value: string | null } = { value: null };

  const answer = await deps.client.request(
    serverId,
    "service.secret",
    { id: moduleId, key },
    {
      onSecret: (secret) => {
        if (secret.key === key) {
          seen.value = secret.value;
        }
      },
    }
  );

  return answer.ok ? seen.value : null;
}

/** One credential, on demand. The caller shows it and lets it go. */
export function credentialValue(
  serverId: unknown,
  moduleId: unknown,
  label: unknown,
  deps: ServicesDeps
): Promise<string | null> {
  if (
    typeof serverId !== "string" ||
    typeof moduleId !== "string" ||
    typeof label !== "string"
  ) {
    return Promise.resolve(null);
  }

  const credential = vaults.get(serverId)?.get(moduleId)?.get(label);

  if (!credential) {
    return Promise.resolve(null);
  }

  return "value" in credential
    ? Promise.resolve(credential.value)
    : revealed(serverId, moduleId, credential.key, deps);
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
