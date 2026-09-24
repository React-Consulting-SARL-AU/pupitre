import { BACKUP_MODULE_ID } from "@pupitre/shared/backup";
import type { AgentResponse } from "@shared/agent";
import type { BackupConnectionView } from "@shared/backups";
import type { CloudflareZone } from "@shared/cloudflare";
import type {
  ConnectionAccount,
  ConnectionCheck,
  ConnectionKind,
  ConnectionOutcome,
  ConnectionState,
  ConnectionsState,
} from "@shared/connections";
import { CONNECTION_KINDS, NO_CONNECTIONS } from "@shared/connections";
import { app, ipcMain, safeStorage } from "electron";
import {
  accountsOfToken,
  checkToken,
  chosenAccount,
  tokenRefusal,
} from "./account-tokens";
import { accountValues } from "./account-values";
import type { Sealer } from "./account-vault";
import { agentClient } from "./agent";
import { backupManaged, backupViewOf, type HeldBackup } from "./backups-run";
import { declaredManifests } from "./catalog";
import { type CloudflareApi, cloudflareApi } from "./cloudflare-api";
import { createConnectionVault } from "./connection-vault";
import { refuseWith } from "./refusal";
import {
  CLOUDFLARE_EXPOSURE,
  checkedRoutes,
  dropTunnel as drop,
  ExposureUnreadable,
  dropRecord as forgetRecord,
  releaseRecords as forgetRecords,
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

  /**
   * A server that has never run the module answers this command all the same,
   * with empty values: the agent keeps a configuration per module of its
   * catalogue, installed or not. So a refusal here never means "no tunnel", it
   * means the machine could not be asked — and the caller must not read silence
   * as absence. It used to: a channel that was down made the install create a
   * second tunnel, which deletes the one of that name the server is running,
   * and cloudflared then answered "Tunnel not found" until someone noticed.
   */
  if (!answer.ok) {
    throw new ExposureUnreadable(answer.error.message);
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

/** The bucket this computer hands its servers, and the secret key beside it. */
export function heldBackup(): HeldBackup | null {
  const view = backupViewOf(vault.settings("backup"));
  const secret = vault.token("backup");

  return view && secret ? { secret, view } : null;
}

export function keepBackup(view: BackupConnectionView, secret: string): void {
  vault.connect(
    "backup",
    secret,
    { id: view.bucket, name: view.bucket },
    { ...view }
  );
}

/**
 * The managed values of an install, from the connections.
 *
 * `lenient` is a machine a backup was just restored on: its modules' managed
 * values are already there, and a connection this computer lacks is left out
 * rather than refusing an install that needs nothing from it.
 */
export async function managedValues(
  serverId: string,
  modules: readonly string[],
  lenient = false
): Promise<AgentResponse<ManagedValues>> {
  const declared = await declaredManifests(serverId);

  if (!declared.ok) {
    return declared;
  }

  const accounts = accountValues(
    modules,
    declared.result,
    (kind) => {
      const token = vault.token(kind);

      return token ? { account: vault.account(kind), token } : null;
    },
    [CLOUDFLARE_EXPOSURE, BACKUP_MODULE_ID],
    lenient
  );

  if (!accounts.ok) {
    return accounts;
  }

  const bucket = backupManaged(modules, heldBackup(), lenient);

  if (!bucket.ok) {
    return bucket;
  }

  const tunnel = await resolveManaged(
    serverId,
    lenient && !vault.token("cloudflare")
      ? modules.filter((id) => id !== CLOUDFLARE_EXPOSURE)
      : modules,
    deps
  );

  if (!tunnel.ok) {
    return tunnel;
  }

  return {
    ok: true,
    result: {
      config: {
        ...accounts.result.config,
        ...bucket.result.config,
        ...tunnel.result.config,
      },
      secrets: {
        ...accounts.result.secrets,
        ...bucket.result.secrets,
        ...tunnel.result.secrets,
      },
    },
  };
}

export function dropTunnel(serverId: string): Promise<void> {
  return drop(serverId, deps);
}

export function releaseHostname(
  serverId: string,
  hostname: string
): Promise<void> {
  return forgetRecord(serverId, hostname, deps);
}

/**
 * The token of a connection, for the main-process clients that call a provider.
 *
 * It is exported to this process alone: everything that reads it — the tunnel,
 * the GitHub client — lives beside it, and nothing of it is ever returned
 * across the bridge.
 */
export function connectionToken(kind: ConnectionKind): string | null {
  return vault.token(kind);
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
  token: string,
  wanted: string | null
): Promise<AgentResponse<ConnectionOutcome>> {
  let accounts: ConnectionAccount[] | null;

  try {
    accounts = await accountsOfToken(kind, token);
  } catch (failure) {
    return tokenRefusal(kind, failure, "refusal.connection.call");
  }

  const account = accounts ? chosenAccount(accounts, wanted) : null;

  if (accounts && !account) {
    if (wanted !== null) {
      return refuseWith("bad_request", "refusal.connection.account.gone", {
        account: wanted,
        kind,
      });
    }

    return { ok: true, result: { accounts, status: "choose" } };
  }

  vault.connect(kind, token, account);

  return {
    ok: true,
    result: { state: connectionsState(), status: "connected" },
  };
}

/**
 * The token, weighed again: what the provider says today replaces the name
 * the vault remembered, so the row reads as the account stands.
 */
async function verify(
  kind: ConnectionKind
): Promise<AgentResponse<ConnectionCheck>> {
  const token = vault.token(kind);

  if (!token) {
    return refuseWith("bad_request", "refusal.connection.absent", { kind });
  }

  const checked = await checkToken(
    kind,
    token,
    fetch,
    vault.account(kind)?.id ?? null
  );

  if (checked.ok && checked.result.status === "answered") {
    vault.connect(kind, token, checked.result.account);
  }

  return checked;
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

/** A connection given as one token: the bucket is given through its own form, `backup:connect`. */
function tokenKind(kind: unknown): kind is ConnectionKind {
  return known(kind) && kind !== "backup";
}

export function registerConnections(): void {
  ipcMain.handle("connections:state", () => connectionsState());

  ipcMain.handle(
    "connections:connect",
    (_event, kind: unknown, token: unknown, accountId: unknown) => {
      if (!tokenKind(kind)) {
        return refuseWith("bad_request", "refusal.connection.kind", {
          kind: String(kind),
        });
      }

      if (typeof token !== "string" || token.trim().length === 0) {
        return refuseWith("bad_request", "refusal.connection.token.none", {
          kind,
        });
      }

      return connect(
        kind,
        token.trim(),
        typeof accountId === "string" && accountId ? accountId : null
      );
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

  ipcMain.handle("connections:verify", (_event, kind: unknown) => {
    if (!tokenKind(kind)) {
      return refuseWith("bad_request", "refusal.connection.kind", {
        kind: String(kind),
      });
    }

    return verify(kind);
  });

  ipcMain.handle("connections:zones", () => zones());

  ipcMain.handle(
    "tunnel:release",
    (_event, serverId: unknown, hostnames: unknown) => {
      if (typeof serverId !== "string") {
        return refuseWith("bad_request", "refusal.server.unknown");
      }

      if (
        !(
          Array.isArray(hostnames) &&
          hostnames.every((hostname) => typeof hostname === "string")
        )
      ) {
        return refuseWith("bad_request", "refusal.params.invalid", {
          cmd: "tunnel:release",
        });
      }

      return forgetRecords(serverId, hostnames, deps);
    }
  );

  ipcMain.handle(
    "tunnel:records",
    (_event, serverId: unknown, routes: unknown) => {
      if (typeof serverId !== "string") {
        return refuseWith("bad_request", "refusal.server.unknown");
      }

      const checked = checkedRoutes(routes ?? []);

      if (!checked) {
        return refuseWith("bad_request", "refusal.params.invalid", {
          cmd: "tunnel:records",
        });
      }

      return reconcile(serverId, checked, deps);
    }
  );
}
