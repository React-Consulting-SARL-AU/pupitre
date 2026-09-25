import { randomBytes } from "node:crypto";
import type {
  InstallSecrets,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import {
  type TunnelRoute,
  TunnelRouteSchema,
} from "@pupitre/shared/agent-protocol/secrets";

import type { AgentResponse } from "@shared/agent";
import type { CloudflareConnection } from "@shared/cloudflare";
import {
  type CloudflareApi,
  type DnsRecord,
  RECORD_COMMENT,
} from "./cloudflare-api";
import { refuseWith } from "./refusal";
import { trace } from "./trace";

export const CLOUDFLARE_EXPOSURE = "exposure.cloudflare";

export interface ManagedValues {
  config: ModuleConfig;
  secrets: InstallSecrets;
}

export interface ServerExposure {
  tunnelId: string;
  domain: string;
}

export interface TunnelDeps {
  connection: () => CloudflareConnection | null;
  api: () => CloudflareApi | null;
  /** Throws `ExposureUnreadable` instead of null: "no tunnel" and "unreadable" call opposite gestures. */
  exposureOf: (serverId: string) => Promise<ServerExposure | null>;
}

export class ExposureUnreadable extends Error {}

const EMPTY: ManagedValues = { config: {}, secrets: {} };

function notConnected(): AgentResponse<never> {
  return refuseWith("bad_request", "refusal.connection.absent", {
    kind: "cloudflare",
  });
}

function callFailed(reason: string): AgentResponse<never> {
  return refuseWith("bad_request", "refusal.connection.call", {
    kind: "cloudflare",
    reason,
  });
}

function tunnelName(serverId: string): string {
  return `pupitre-${serverId}`;
}

export function checkedRoutes(raw: unknown): TunnelRoute[] | null {
  if (!Array.isArray(raw)) {
    return null;
  }

  const routes: TunnelRoute[] = [];

  for (const candidate of raw) {
    const parsed = TunnelRouteSchema.safeParse(candidate);

    if (!parsed.success) {
      return null;
    }

    routes.push(parsed.data);
  }

  return routes;
}

function under(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  const zone = domain.toLowerCase();

  return host === zone || host.endsWith(`.${zone}`);
}

/** A kept tunnel gets no secret: Cloudflare never returns one, and the agent keeps a secret it was not sent. */
export async function managedValues(
  serverId: string,
  modules: readonly string[],
  deps: TunnelDeps
): Promise<AgentResponse<ManagedValues>> {
  if (!modules.includes(CLOUDFLARE_EXPOSURE)) {
    return { ok: true, result: EMPTY };
  }

  const connection = deps.connection();
  const api = deps.api();

  if (!(connection && api)) {
    return notConnected();
  }

  try {
    const held = await deps.exposureOf(serverId);

    // cloudflared refuses to run a tunnel the account no longer holds.
    if (held?.tunnelId && (await api.hasTunnel(held.tunnelId))) {
      return {
        ok: true,
        result: {
          config: {
            [CLOUDFLARE_EXPOSURE]: {
              account_tag: connection.accountId,
              tunnel_id: held.tunnelId,
            },
          },
          secrets: {},
        },
      };
    }

    const tunnel = await createTunnel(serverId, api);

    return {
      ok: true,
      result: {
        config: {
          [CLOUDFLARE_EXPOSURE]: {
            account_tag: connection.accountId,
            tunnel_id: tunnel.id,
          },
        },
        secrets: {
          [CLOUDFLARE_EXPOSURE]: { tunnel_secret: tunnel.secret },
        },
      },
    };
  } catch (failure) {
    // Creating a tunnel deletes the same-named one, which may be the one this server runs right now.
    if (failure instanceof ExposureUnreadable) {
      return refuseWith("bad_request", "refusal.cloudflare.exposure.unread", {
        reason: failure.message,
      });
    }

    return callFailed(reasonOf(failure));
  }
}

const NAME_TAKEN = /already have a tunnel with this name/i;

/** A same-named orphan is unusable (its secret is gone); the retry exists because Cloudflare's listing lags. */
async function createTunnel(
  serverId: string,
  api: CloudflareApi
): Promise<{ id: string; secret: string }> {
  const secret = randomBytes(32).toString("base64");
  const name = tunnelName(serverId);

  const orphan = await api.findTunnel(name);

  if (orphan) {
    await api.deleteTunnel(orphan);
  }

  try {
    return { id: await api.createTunnel(name, secret), secret };
  } catch (failure) {
    if (!(failure instanceof Error && NAME_TAKEN.test(failure.message))) {
      throw failure;
    }

    const survivor = await api.findTunnel(name);

    if (!survivor) {
      throw failure;
    }

    await api.deleteTunnel(survivor);

    return { id: await api.createTunnel(name, secret), secret };
  }
}

export async function syncRecords(
  serverId: string,
  routes: readonly TunnelRoute[],
  deps: TunnelDeps
): Promise<AgentResponse<number>> {
  const api = deps.api();

  if (!api) {
    return notConnected();
  }

  try {
    const exposure = await deps.exposureOf(serverId);

    if (!exposure?.tunnelId) {
      return notConnected();
    }

    // The token covers every zone of the account: a route outside the server's domain must not write there.
    const foreign = routes.find(
      (route) => !under(route.hostname, exposure.domain)
    );

    if (foreign) {
      return refuseWith("bad_request", "refusal.tunnel.route.foreign", {
        domain: exposure.domain,
        hostname: foreign.hostname,
      });
    }

    const zone = await api.zoneOf(exposure.domain);

    if (!zone) {
      return refuseWith("bad_request", "refusal.cloudflare.zone.unknown", {
        domain: exposure.domain,
      });
    }

    const target = `${exposure.tunnelId}.cfargotunnel.com`;
    let touched = 0;

    for (const route of routes) {
      const existing = await api.findRecord(zone.id, route.hostname);

      if (existing?.content === target) {
        continue;
      }

      if (existing && !owned(existing)) {
        return refuseWith("bad_request", "refusal.cloudflare.record.taken", {
          hostname: route.hostname,
        });
      }

      if (existing) {
        await api.updateRecord(zone.id, existing.id, target);
      } else {
        await api.createRecord(zone.id, route.hostname, target);
      }

      touched += 1;
    }

    return { ok: true, result: touched };
  } catch (failure) {
    return callFailed(reasonOf(failure));
  }
}

/** The zone may hold the platform's own or hand-written names: only records the app marked are touched. */
function owned(record: DnsRecord): boolean {
  return record.comment === RECORD_COMMENT;
}

export async function dropRecord(
  serverId: string,
  hostname: string,
  deps: TunnelDeps
): Promise<void> {
  const api = deps.api();

  if (!api) {
    return;
  }

  try {
    const exposure = await deps.exposureOf(serverId);

    if (!(exposure?.domain && under(hostname, exposure.domain))) {
      return;
    }

    const zone = await api.zoneOf(exposure.domain);

    if (!zone) {
      return;
    }

    const existing = await api.findRecord(zone.id, hostname);

    if (existing && owned(existing)) {
      await api.deleteRecord(zone.id, existing.id);
    }
  } catch (failure) {
    trace("tunnel", "record-kept", {
      fix: "delete the record from the Cloudflare dashboard",
      hostname,
      reason: reasonOf(failure),
    });
  }
}

export async function releaseRecords(
  _serverId: string,
  hostnames: readonly string[],
  deps: TunnelDeps
): Promise<AgentResponse<number>> {
  const api = deps.api();

  if (!api) {
    return notConnected();
  }

  try {
    let dropped = 0;

    for (const hostname of hostnames) {
      const zone = await api.zoneOf(hostname);
      const existing = zone ? await api.findRecord(zone.id, hostname) : null;

      if (zone && existing && owned(existing)) {
        await api.deleteRecord(zone.id, existing.id);
        dropped += 1;
      }
    }

    return { ok: true, result: dropped };
  } catch (failure) {
    return callFailed(reasonOf(failure));
  }
}

export async function dropTunnel(
  serverId: string,
  deps: TunnelDeps
): Promise<void> {
  const api = deps.api();

  if (!api) {
    return;
  }

  try {
    // A released server is often unreachable: its tunnel is then found by the app's own name for it.
    const exposure = await deps
      .exposureOf(serverId)
      .catch((failure: unknown) => {
        if (failure instanceof ExposureUnreadable) {
          return null;
        }

        throw failure;
      });

    const id =
      exposure?.tunnelId ?? (await api.findTunnel(tunnelName(serverId)));

    if (id) {
      await api.deleteTunnel(id);
    }
  } catch (failure) {
    trace("tunnel", "tunnel-kept", {
      fix: "delete the tunnel from the Cloudflare dashboard",
      reason: reasonOf(failure),
      server: serverId,
    });
  }
}

function reasonOf(failure: unknown): string {
  return failure instanceof Error ? failure.message : String(failure);
}
