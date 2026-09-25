import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import {
  deriveBackupIdentity,
  drawBackupSalt,
  normalizePassphrase,
} from "@pupitre/shared/backup/crypto";
import type { AgentResponse } from "@shared/agent";
import type {
  BackupStorage,
  OrganizationIdentity,
  PlatformBackup,
  RestoreUpdate,
} from "@shared/backups";
import type { WebContents } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import {
  connectBackup,
  type DataDeps,
  latestIdentity,
  probeConnection,
  restoreData,
  restoreSetup,
  type SetupDeps,
  type Unlocked,
} from "./backups-run";
import { heldBackup, keepBackup } from "./connections";
import { asAgentError } from "./enrollment-run";
import { handle } from "./ipc";
import { anything, isString, shape } from "./ipc-guard";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { probeBucket } from "./s3";
import { byId } from "./servers";

// The private key derived for a restore lives here alone, per server: never on disk, in a store or across the bridge.
const unlocked = new Map<string, Unlocked>();

function forget(serverId: string): void {
  unlocked.get(serverId)?.privateKey.fill(0);
  unlocked.delete(serverId);
}

export function restoring(serverId: string): boolean {
  return unlocked.has(serverId);
}

function platformIdOf(serverId: string): string | null {
  return (
    agentClient.session(serverId)?.server_id ??
    byId(serverId)?.grant?.id ??
    null
  );
}

async function organizationBackups(): Promise<AgentResponse<PlatformBackup[]>> {
  const answer = await account.backups();

  return answer.ok ? answer : { ok: false, error: asAgentError(answer.error) };
}

async function serverBackups(
  serverId: string
): Promise<AgentResponse<PlatformBackup[]>> {
  const platformId = platformIdOf(serverId);

  if (!platformId) {
    return refuseWith("bad_request", "refusal.backup.unenrolled");
  }

  const answer = await account.backups(platformId);

  return answer.ok ? answer : { ok: false, error: asAgentError(answer.error) };
}

async function organizationIdentity(): Promise<
  AgentResponse<OrganizationIdentity | null>
> {
  const listed = await organizationBackups();

  return listed.ok
    ? { ok: true, result: latestIdentity(listed.result) }
    : listed;
}

const restoreDeps: SetupDeps & DataDeps = {
  backups: organizationBackups,
  derive: deriveBackupIdentity,
  forget,
  held: heldBackup,
  async noteRestored(backupId, serverId) {
    const platformId = platformIdOf(serverId);

    if (platformId) {
      await account.backupRestored(backupId, platformId);
    }
  },
  recall: (serverId) => unlocked.get(serverId) ?? null,
  remember(serverId, key) {
    forget(serverId);
    unlocked.set(serverId, key);
  },
  request: (serverId, cmd, params, options) =>
    agentClient.request(serverId, cmd, params as never, options),
  sync: (serverId) => agentClient.request(serverId, "platform.sync"),
};

function updates(
  sender: WebContents,
  token: string
): (update: RestoreUpdate) => void {
  return relayTo<RestoreUpdate>(
    sender,
    token,
    "backup:restore-update",
    "update"
  );
}

/** The renderer trusts the answer only once `end` lands, since an answer can overtake its updates. */
async function ended<T>(
  sender: WebContents,
  token: string,
  work: Promise<T>
): Promise<T> {
  const answer = await work;

  relayTo<boolean>(sender, token, "backup:restore-update", "end")(true);

  return answer;
}

function known(serverId: unknown): serverId is string {
  return typeof serverId === "string" && byId(serverId) !== null;
}

function partsOf(value: unknown): string[] | null {
  return Array.isArray(value) &&
    value.every((part) => typeof part === "string" && part.length > 0)
    ? (value as string[])
    : null;
}

function isPassphrase(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

export function registerBackups(): void {
  handle("backup:connection", shape(), () => heldBackup()?.view ?? null);

  handle("backup:identity", shape(), () => organizationIdentity());

  const connectDeps = {
    derive: deriveBackupIdentity,
    drawSalt: drawBackupSalt,
    held: heldBackup,
    identity: organizationIdentity,
    keep: keepBackup,
    normalize: normalizePassphrase,
    probe: (storage: BackupStorage, secret: string) =>
      probeBucket(storage, secret),
  };

  handle("backup:probe", shape(anything), async (_event, input) => {
    const probed = await probeConnection(input, connectDeps);

    return probed.ok ? { ok: true, result: null } : probed;
  });

  handle("backup:connect", shape(anything), (_event, input) =>
    connectBackup(input, connectDeps)
  );

  handle("backup:list", shape(anything), (_event, serverId) => {
    if (serverId === null) {
      return organizationBackups();
    }

    return known(serverId)
      ? serverBackups(serverId)
      : refuseWith("bad_request", "refusal.server.unknown");
  });

  handle(
    "backup:restore-setup",
    shape(isString, anything, anything, anything, anything),
    (event, token, serverId, backupId, passphrase, options) => {
      if (!known(serverId)) {
        return refuseWith("bad_request", "refusal.server.unknown");
      }

      if (typeof backupId !== "string" || typeof passphrase !== "string") {
        return refuseWith("bad_request", "refusal.params.invalid", {
          cmd: "backup:restore-setup",
        });
      }

      const asked = (options ?? {}) as {
        revert?: unknown;
        saveFirst?: unknown;
      };

      return ended(
        event.sender,
        token,
        restoreSetup(
          serverId,
          backupId,
          passphrase,
          {
            revert: asked.revert === true,
            saveFirst: asked.saveFirst === true,
          },
          updates(event.sender, token),
          restoreDeps
        )
      );
    }
  );

  handle(
    "backup:restore-data",
    shape(isString, anything, anything, anything, isPassphrase),
    (event, token, serverId, backupId, parts, passphrase) => {
      const named = partsOf(parts);

      if (!known(serverId)) {
        return refuseWith("bad_request", "refusal.server.unknown");
      }

      if (typeof backupId !== "string" || !named) {
        return refuseWith("bad_request", "refusal.params.invalid", {
          cmd: "backup:restore-data",
        });
      }

      const relay = updates(event.sender, token);

      return ended(
        event.sender,
        token,
        restoreData(
          serverId,
          backupId,
          named,
          passphrase || null,
          (update: Event) => relay({ event: update, kind: "event" }),
          restoreDeps
        )
      );
    }
  );

  handle("backup:restore-abort", shape(anything), async (_event, serverId) => {
    if (!known(serverId)) {
      return refuseWith("bad_request", "refusal.server.unknown");
    }

    const answer = await agentClient.request(serverId, "backup.restore.abort");

    if (answer.ok) {
      forget(serverId);
    }

    return answer;
  });
}
