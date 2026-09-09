import { randomBytes } from "node:crypto";
import type {
  InstallSecrets,
  ModuleConfig,
} from "@pupitre/shared/agent-protocol/install";
import type { TunnelRoute } from "@pupitre/shared/agent-protocol/secrets";

import type { AgentResponse } from "@shared/agent";
import type { CloudflareConnection } from "@shared/cloudflare";
import type { CloudflareApi } from "./cloudflare-api";
import { refuseWith } from "./refusal";
import { trace } from "./trace";

/**
 * The client's tunnel, set up from their laptop and owned by their server.
 *
 * The app holds the Cloudflare token, makes the tunnel and writes the DNS; the
 * server receives what makes it run and is then the only place its identifier
 * lives. Everything after the install reads it back from there — a laptop that
 * is reinstalled, or a server handed to a colleague, finds the same tunnel with
 * nothing but the account token. The zone follows the domain, which is a field
 * of the module like any other, so one account carries several servers under
 * several zones without anyone copying an identifier.
 */

export const CLOUDFLARE_EXPOSURE = "exposure.cloudflare";

export interface ManagedValues {
  config: ModuleConfig;
  secrets: InstallSecrets;
}

/** What the server says it was configured with: the plain values, never a secret. */
export interface ServerExposure {
  tunnelId: string;
  domain: string;
}

export interface TunnelDeps {
  connection: () => CloudflareConnection | null;
  api: () => CloudflareApi | null;
  /** Reads `module.config` on the server: the tunnel it runs, and what it publishes. */
  exposureOf: (serverId: string) => Promise<ServerExposure | null>;
}

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

/**
 * What the installation asks nobody for.
 *
 * The three managed fields come from here. A server that already runs a tunnel
 * the account still holds keeps it and receives no secret at all — Cloudflare
 * never gives one back, and the agent leaves a secret it was not sent exactly
 * as it was. A server with no tunnel, or one naming a tunnel that has since
 * gone, gets a new one made for it.
 */
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

    // A tunnel the account no longer holds is one cloudflared refuses to run:
    // handing it back would install a service that can never carry anything.
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
    return callFailed(reasonOf(failure));
  }
}

const NAME_TAKEN = /already have a tunnel with this name/i;

/**
 * A same-named tunnel that survived a reinstall is unusable: its secret left
 * with the machine that ran it. It is looked for and removed first; a name
 * Cloudflare still refuses after that is looked for once more, because its
 * listing lags behind its refusals.
 */
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

/**
 * The records the agent's routes call for.
 *
 * A record still pointing at a vanished tunnel is error 1033 in the browser:
 * DNS answers, and nothing is behind it.
 */
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

/** A project that leaves takes its record with it: leaving it behind is a name answering into the void. */
export async function dropRecord(
  serverId: string,
  subdomain: string,
  deps: TunnelDeps
): Promise<void> {
  const api = deps.api();

  if (!api) {
    return;
  }

  try {
    const exposure = await deps.exposureOf(serverId);

    if (!exposure?.domain) {
      return;
    }

    const zone = await api.zoneOf(exposure.domain);

    if (!zone) {
      return;
    }

    const existing = await api.findRecord(
      zone.id,
      `${subdomain}.${exposure.domain}`
    );

    if (existing) {
      await api.deleteRecord(zone.id, existing.id);
    }
  } catch (failure) {
    trace("tunnel", "record-kept", {
      fix: "delete the record from the Cloudflare dashboard",
      reason: reasonOf(failure),
      subdomain,
    });
  }
}

/** The tunnel of a server being released follows the server: it has nothing left to carry. */
export async function dropTunnel(
  serverId: string,
  deps: TunnelDeps
): Promise<void> {
  const api = deps.api();

  if (!api) {
    return;
  }

  try {
    // The server is the one that knows; a machine already gone leaves the name,
    // which is this app's own and enough to find the tunnel again.
    const exposure = await deps.exposureOf(serverId);
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
