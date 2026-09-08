import type { TunnelRoute } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentResponse } from "@shared/agent";
import type {
  CloudflareConnection,
  CloudflareZone,
  ConnectionsState,
} from "@shared/cloudflare";
import { app, ipcMain, safeStorage } from "electron";
import type { Sealer } from "./account-vault";
import { agentClient } from "./agent";
import {
  type CloudflareApi,
  cloudflareApi,
  verifyToken,
} from "./cloudflare-api";
import { createCloudflareVault } from "./cloudflare-vault";
import { refuseWith } from "./refusal";
import {
  CLOUDFLARE_EXPOSURE,
  dropTunnel as drop,
  dropRecord as forgetRecord,
  type ManagedValues,
  syncRecords as reconcile,
  managedValues as resolveManaged,
  type ServerExposure,
  type TunnelDeps,
} from "./tunnel-run";

/**
 * The third-party accounts the app holds for the client, once for every server.
 *
 * A connection is not a module: it is what a module needs before it can be
 * installed, and the manifest says so. The token lives in the system keychain
 * and never comes back across the bridge; what the window learns is that an
 * account is connected and under what name.
 */

const sealer: Sealer = {
  available: () => safeStorage.isEncryptionAvailable(),
  decrypt: (value) => safeStorage.decryptString(value),
  encrypt: (value) => safeStorage.encryptString(value),
};

const vault = createCloudflareVault({
  dir: app.getPath("userData"),
  sealer,
});

function api(): CloudflareApi | null {
  const token = vault.token();
  const connection = vault.connection();

  return token && connection ? cloudflareApi(token, connection) : null;
}

/**
 * What the server says it publishes, read back rather than remembered.
 *
 * `module.config` carries the plain values the agent kept; the tunnel secret is
 * not among them, and never needs to be — a tunnel is created once and run
 * afterwards.
 */
async function exposureOf(serverId: string): Promise<ServerExposure | null> {
  const answer = await agentClient.request(serverId, "module.config", {
    id: CLOUDFLARE_EXPOSURE,
  });

  if (!answer.ok) {
    return null;
  }

  const values = answer.result.values;
  const tunnelId = typeof values.tunnel_id === "string" ? values.tunnel_id : "";
  const domain = typeof values.domain === "string" ? values.domain : "";

  return tunnelId || domain ? { domain, tunnelId } : null;
}

const deps: TunnelDeps = {
  api,
  connection: () => vault.connection(),
  exposureOf,
};

export function managedValues(
  serverId: string,
  modules: readonly string[]
): Promise<AgentResponse<ManagedValues>> {
  return resolveManaged(serverId, modules, deps);
}

export function dropTunnel(serverId: string): Promise<void> {
  return drop(serverId, deps);
}

export function releaseSubdomain(
  serverId: string,
  subdomain: string
): Promise<void> {
  return forgetRecord(serverId, subdomain, deps);
}

export function connectionsState(): ConnectionsState {
  const connection = vault.connection();

  return {
    cloudflare: connection
      ? { connection, sealed: vault.sealed(), status: "connected" }
      : { status: "absent" },
  };
}

/**
 * The token, weighed the moment it is given.
 *
 * The bash stack this replaces checked it at the fifth second rather than at
 * the eighth step, and this is that check: what comes back is the list of
 * accounts it opens, which is also the identifier the client would otherwise
 * have had to copy out of a dashboard.
 */
async function connect(
  token: string
): Promise<AgentResponse<ConnectionsState>> {
  let accounts: CloudflareConnection[];

  try {
    accounts = (await verifyToken(token)).map(({ id, name }) => ({
      accountId: id,
      accountName: name,
    }));
  } catch (failure) {
    return refuseWith("bad_request", "refusal.cloudflare.call", {
      reason: failure instanceof Error ? failure.message : String(failure),
    });
  }

  const account = accounts[0];

  if (!account) {
    return refuseWith("bad_request", "refusal.cloudflare.account.none");
  }

  vault.connect(token, account);

  return { ok: true, result: connectionsState() };
}

async function zones(): Promise<AgentResponse<CloudflareZone[]>> {
  const client = api();

  if (!client) {
    return refuseWith("bad_request", "refusal.cloudflare.absent");
  }

  try {
    return { ok: true, result: await client.zones() };
  } catch (failure) {
    return refuseWith("bad_request", "refusal.cloudflare.call", {
      reason: failure instanceof Error ? failure.message : String(failure),
    });
  }
}

export function registerConnections(): void {
  ipcMain.handle("connections:state", () => connectionsState());

  ipcMain.handle("connections:connect", (_event, token: unknown) => {
    if (typeof token !== "string" || token.trim().length === 0) {
      return refuseWith("bad_request", "refusal.cloudflare.token.none");
    }

    return connect(token.trim());
  });

  ipcMain.handle("connections:forget", () => {
    vault.clear();

    return connectionsState();
  });

  ipcMain.handle("connections:zones", () => zones());

  ipcMain.handle(
    "tunnel:records",
    (_event, serverId: unknown, routes: unknown) => {
      if (typeof serverId !== "string") {
        return refuseWith("bad_request", "refusal.server.unknown");
      }

      return reconcile(serverId, (routes ?? []) as TunnelRoute[], deps);
    }
  );
}
