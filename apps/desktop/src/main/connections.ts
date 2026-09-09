import type { TunnelRoute } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentResponse } from "@shared/agent";
import type { CloudflareZone } from "@shared/cloudflare";
import type {
  ConnectionAccount,
  ConnectionKind,
  ConnectionState,
  ConnectionsState,
} from "@shared/connections";
import { CONNECTION_KINDS, NO_CONNECTIONS } from "@shared/connections";
import { app, ipcMain, safeStorage } from "electron";
import { accountSecrets } from "./account-secrets";
import { accountOfToken } from "./account-tokens";
import type { Sealer } from "./account-vault";
import { agentClient } from "./agent";
import { type CloudflareApi, cloudflareApi } from "./cloudflare-api";
import { createConnectionVault } from "./connection-vault";
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
 *
 * Nothing changes on the wire for having moved a token here. It still reaches
 * the machine on the install's own secret line, written by this process, and
 * still lands in `/etc/pupitre/env` under root alone. What changed is where the
 * app took it from: a keychain the client filled once, instead of a field they
 * would have retyped for every server.
 */

const sealer: Sealer = {
  available: () => safeStorage.isEncryptionAvailable(),
  decrypt: (value) => safeStorage.decryptString(value),
  encrypt: (value) => safeStorage.encryptString(value),
};

const vault = createConnectionVault({
  dir: app.getPath("userData"),
  sealer,
});

function cloudflareAccount(): {
  accountId: string;
  accountName: string;
} | null {
  const account = vault.account("cloudflare");

  return account ? { accountId: account.id, accountName: account.name } : null;
}

function api(): CloudflareApi | null {
  const token = vault.token("cloudflare");
  const connection = cloudflareAccount();

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
  connection: cloudflareAccount,
  exposureOf,
};

export async function managedValues(
  serverId: string,
  modules: readonly string[]
): Promise<AgentResponse<ManagedValues>> {
  const accounts = accountSecrets(modules, (kind) => vault.token(kind));

  if (!accounts.ok) {
    return accounts;
  }

  const tunnel = await resolveManaged(serverId, modules, deps);

  if (!tunnel.ok) {
    return tunnel;
  }

  return {
    ok: true,
    result: {
      config: tunnel.result.config,
      secrets: { ...accounts.result, ...tunnel.result.secrets },
    },
  };
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

function stateOf(kind: ConnectionKind): ConnectionState {
  if (!vault.holds(kind)) {
    return { status: "absent" };
  }

  return {
    account: vault.account(kind),
    sealed: vault.sealed(),
    status: "connected",
  };
}

export function connectionsState(): ConnectionsState {
  const state = { ...NO_CONNECTIONS };

  for (const kind of CONNECTION_KINDS) {
    state[kind] = stateOf(kind);
  }

  return state;
}

/**
 * The token, weighed the moment it is given.
 *
 * What comes back is the account it opens, which is also the identifier the
 * client would otherwise have had to copy out of a dashboard. A provider the
 * laptop cannot ask answers null, and the connection is held unnamed.
 */
async function connect(
  kind: ConnectionKind,
  token: string
): Promise<AgentResponse<ConnectionsState>> {
  let account: ConnectionAccount | null;

  try {
    account = await accountOfToken(kind, token);
  } catch (failure) {
    return refuseWith("bad_request", "refusal.connection.call", {
      kind,
      reason: failure instanceof Error ? failure.message : String(failure),
    });
  }

  vault.connect(kind, token, account);

  return { ok: true, result: connectionsState() };
}

async function zones(): Promise<AgentResponse<CloudflareZone[]>> {
  const client = api();

  if (!client) {
    return refuseWith("bad_request", "refusal.connection.absent", {
      kind: "cloudflare",
    });
  }

  try {
    return { ok: true, result: await client.zones() };
  } catch (failure) {
    return refuseWith("bad_request", "refusal.connection.call", {
      kind: "cloudflare",
      reason: failure instanceof Error ? failure.message : String(failure),
    });
  }
}

function known(kind: unknown): kind is ConnectionKind {
  return (CONNECTION_KINDS as readonly string[]).includes(String(kind));
}

export function registerConnections(): void {
  ipcMain.handle("connections:state", () => connectionsState());

  ipcMain.handle(
    "connections:connect",
    (_event, kind: unknown, token: unknown) => {
      if (!known(kind)) {
        return refuseWith("bad_request", "refusal.connection.kind", {
          kind: String(kind),
        });
      }

      if (typeof token !== "string" || token.trim().length === 0) {
        return refuseWith("bad_request", "refusal.connection.token.none", {
          kind,
        });
      }

      return connect(kind, token.trim());
    }
  );

  ipcMain.handle("connections:forget", (_event, kind: unknown) => {
    if (!known(kind)) {
      return refuseWith("bad_request", "refusal.connection.kind", {
        kind: String(kind),
      });
    }

    vault.clear(kind);

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
