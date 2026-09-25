import type { ModuleConfig } from "@pupitre/shared/agent-protocol/install";
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
import { app, safeStorage } from "electron";
import {
  accountsOfToken,
  checkToken,
  chosenAccount,
  tokenRefusal,
} from "./account-tokens";
import { accountValues, type HeldConnection } from "./account-values";
import { agentClient } from "./agent";
import { backupManaged, backupViewOf, type HeldBackup } from "./backups-run";
import { declaredManifests } from "./catalog";
import { type CloudflareApi, cloudflareApi } from "./cloudflare-api";
import { createConnectionVault } from "./connection-vault";
import { handle } from "./ipc";
import { anything, isString, optional, shape } from "./ipc-guard";
import { keychainSealer } from "./keychain";
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

const vault = createConnectionVault({
  dir: app.getPath("userData"),
  sealer: keychainSealer(safeStorage, process.platform),
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

async function exposureOf(serverId: string): Promise<ServerExposure | null> {
  const answer = await agentClient.request(serverId, "module.config", {
    id: CLOUDFLARE_EXPOSURE,
  });

  // A refusal is never "no tunnel": read as absence, a second tunnel of that name deleted the live one.
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

function heldAccount(kind: ConnectionKind): HeldConnection | null {
  const token = vault.token(kind);

  return token ? { account: vault.account(kind), token } : null;
}

/** `lenient`: a machine just restored already holds its managed values, so a missing connection is left out. */
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
    heldAccount,
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

/** No secret leaves and no tunnel is opened: a missing connection adds nothing, the install refuses later. */
export async function weighedValues(
  serverId: string,
  modules: readonly string[]
): Promise<ModuleConfig> {
  const declared = await declaredManifests(serverId);

  if (!declared.ok) {
    return {};
  }

  const accounts = accountValues(
    modules,
    declared.result,
    heldAccount,
    [CLOUDFLARE_EXPOSURE, BACKUP_MODULE_ID],
    true
  );
  const bucket = backupManaged(modules, heldBackup(), true);

  return {
    ...(accounts.ok ? accounts.result.config : {}),
    ...(bucket.ok ? bucket.result.config : {}),
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

/** Main process only: no channel ever returns the token across the bridge. */
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

/** A provider the laptop cannot ask answers null accounts, and the connection is held unnamed. */
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

/** The bucket is not given as one token: it connects through its own form, `backup:connect`. */
function tokenKind(kind: unknown): kind is ConnectionKind {
  return known(kind) && kind !== "backup";
}

export function registerConnections(): void {
  handle("connections:state", shape(), () => connectionsState());

  handle(
    "connections:connect",
    shape(anything, anything, optional(isString)),
    (_event, kind, token, accountId) => {
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

      return connect(kind, token.trim(), accountId || null);
    }
  );

  handle("connections:forget", shape(anything), (_event, kind) => {
    if (!known(kind)) {
      return refuseWith("bad_request", "refusal.connection.kind", {
        kind: String(kind),
      });
    }

    vault.clear(kind);

    return connectionsState();
  });

  handle("connections:verify", shape(anything), (_event, kind) => {
    if (!tokenKind(kind)) {
      return refuseWith("bad_request", "refusal.connection.kind", {
        kind: String(kind),
      });
    }

    return verify(kind);
  });

  handle("connections:zones", shape(), () => zones());

  handle(
    "tunnel:release",
    shape(anything, anything),
    (_event, serverId, hostnames) => {
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

  handle(
    "tunnel:records",
    shape(anything, anything),
    (_event, serverId, routes) => {
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
