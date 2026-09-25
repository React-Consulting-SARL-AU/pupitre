import type { DbEngine } from "@pupitre/shared/agent-protocol/secrets";
import type {
  ServiceLogsResult,
  ServiceStatusResult,
} from "@pupitre/shared/agent-protocol/state";
import type { AgentResponse } from "@shared/agent";
import {
  CONNECTION_LABEL,
  databaseEngineOf,
  type ServiceDetail,
} from "@shared/services";
import type { AgentClient } from "./agent-client";
import { refusalOf, refuseWith } from "./refusal";

export interface ServicesDeps {
  client: Pick<AgentClient, "request">;
  knows: (serverId: string) => boolean;
  declares: (serverId: string, moduleId: string) => boolean;
}

/** The renderer never invents a service or a folder: only what the last `snapshot`/`status` listed. */
const listed = new Map<string, Map<string, string | null>>();

const LISTINGS: ReadonlySet<string> = new Set(["snapshot", "status"]);

export function noteServices(
  serverId: string,
  cmd: string,
  answer: AgentResponse<unknown>
): void {
  if (!(answer.ok && LISTINGS.has(cmd))) {
    return;
  }

  const services = (answer.result as { services?: unknown }).services;

  if (!Array.isArray(services)) {
    return;
  }

  listed.set(
    serverId,
    new Map(
      services.flatMap((service: { id?: unknown; path?: unknown }) =>
        typeof service?.id === "string"
          ? [
              [
                service.id,
                typeof service.path === "string" && service.path.startsWith("/")
                  ? service.path
                  : null,
              ] as const,
            ]
          : []
      )
    )
  );
}

export function declaresService(serverId: string, moduleId: string): boolean {
  return listed.get(serverId)?.has(moduleId) ?? false;
}

export function servicePath(serverId: string, moduleId: string): string | null {
  return listed.get(serverId)?.get(moduleId) ?? null;
}

export function forgetServices(serverId?: string): void {
  if (serverId) {
    listed.delete(serverId);
  } else {
    listed.clear();
  }
}

/** Matches the timeout a followed project journal is allowed. */
const FOLLOW_MS = 1_800_000;

const DEFAULT_LINES = 120;

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

export function namedService(
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

  if (!deps.declares(serverId, moduleId)) {
    return refuseWith("service_not_found", "refusal.service.unknown", {
      service: moduleId,
    });
  }

  return { moduleId, serverId };
}

export function isServiceRefusal<T>(
  value: T | AgentResponse<never>
): value is AgentResponse<never> {
  return typeof value === "object" && value !== null && "ok" in value;
}

function detailOf(
  status: ServiceStatusResult,
  vault: Map<string, Held>
): ServiceDetail {
  return {
    // An agent older than the field omits it, and a module it never deferred is configured.
    configured: status.configured !== false,
    credentials: [...vault.keys()],
    id: status.id,
    name: status.name,
    state: status.state,
    ...(status.version === undefined ? {} : { version: status.version }),
    ...(status.port === undefined ? {} : { port: status.port }),
    ...(status.unit === undefined ? {} : { unit: status.unit }),
    ...(status.login === undefined ? {} : { login: status.login }),
  };
}

export async function readService(
  serverId: unknown,
  moduleId: unknown,
  deps: ServicesDeps
): Promise<AgentResponse<ServiceDetail>> {
  const call = namedService(serverId, moduleId, deps);

  if (isServiceRefusal(call)) {
    return call;
  }

  const answer = await deps.client.request(call.serverId, "service.status", {
    id: call.moduleId,
  });

  if (!answer.ok) {
    return answer;
  }

  const vault = held(call.serverId, call.moduleId);

  // Labels are localized by the agent: stale ones would list a credential twice after a language change.
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

/** The engine comes from the module identifier, never from the renderer. */
export async function readDatabaseUrl(
  serverId: unknown,
  moduleId: unknown,
  name: unknown,
  deps: ServicesDeps
): Promise<AgentResponse<{ label: string }>> {
  const call = namedService(serverId, moduleId, deps);

  if (isServiceRefusal(call)) {
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

/** The value rides the `secret` event, not the result, so no request/answer recorder ever captures it. */
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

/** A follow holds the follow channel: the signal releases it before the timeout. */
export async function serviceLogs(
  serverId: unknown,
  moduleId: unknown,
  lines: unknown,
  follow: boolean,
  onLine: (line: string) => void,
  deps: ServicesDeps,
  signal?: AbortSignal
): Promise<AgentResponse<ServiceLogsResult>> {
  const call = namedService(serverId, moduleId, deps);

  if (isServiceRefusal(call)) {
    return call;
  }

  const count =
    typeof lines === "number" && lines > 0 ? Math.floor(lines) : DEFAULT_LINES;

  return await deps.client.request(
    call.serverId,
    "service.logs",
    { follow, id: call.moduleId, lines: count },
    {
      onEvent: (event) => {
        const line = (event as { line?: unknown }).line;

        if (event.event === "log" && typeof line === "string") {
          onLine(line);
        }
      },
      ...(follow ? { timeoutMs: FOLLOW_MS } : {}),
      ...(signal ? { signal } : {}),
    }
  );
}
