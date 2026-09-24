import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import {
  deriveBackupIdentity,
  drawBackupSalt,
  normalizePassphrase,
} from "@pupitre/shared/backup/crypto";
import type { AgentResponse } from "@shared/agent";
import type {
  OrganizationIdentity,
  PlatformBackup,
  RestoreUpdate,
} from "@shared/backups";
import { ipcMain, type WebContents } from "electron";
import { account } from "./account";
import { agentClient } from "./agent";
import {
  connectBackup,
  type DataDeps,
  latestIdentity,
  restoreData,
  restoreSetup,
  type SetupDeps,
  type Unlocked,
} from "./backups-run";
import { heldBackup, keepBackup } from "./connections";
import { asAgentError } from "./enrollment-run";
import { refuseWith } from "./refusal";
import { relayTo } from "./relay";
import { probeBucket } from "./s3";
import { byId } from "./servers";

/**
 * Backups, wired to this computer: the bucket in the keychain, the platform
 * that lists what the organization holds, and the agent that restores.
 *
 * A restore keeps the private key it derived here, per server, from the
 * configuration to the data — and nowhere else: not on a disk, not in a store,
 * never across the bridge.
 */

const unlocked = new Map<string, Unlocked>();

function forget(serverId: string): void {
  unlocked.get(serverId)?.privateKey.fill(0);
  unlocked.delete(serverId);
}

/** A machine a backup's configuration was put on, whose data has not come back yet. */
export function restoring(serverId: string): boolean {
  return unlocked.has(serverId);
}

/** The platform's name for a server of the list: the agent's own word first, the grant's otherwise. */
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
  token: unknown
): (update: RestoreUpdate) => void {
  return relayTo<RestoreUpdate>(
    sender,
    token,
    "backup:restore-update",
    "update"
  );
}

/** The last word on the update channel: the renderer trusts the answer once every step before it has landed. */
async function ended<T>(
  sender: WebContents,
  token: unknown,
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

export function registerBackups(): void {
  ipcMain.handle("backup:connection", () => heldBackup()?.view ?? null);

  ipcMain.handle("backup:identity", () => organizationIdentity());

  ipcMain.handle("backup:connect", (_event, input: unknown) =>
    connectBackup(input, {
      derive: deriveBackupIdentity,
      drawSalt: drawBackupSalt,
      held: heldBackup,
      identity: organizationIdentity,
      keep: keepBackup,
      normalize: normalizePassphrase,
      probe: (storage, secret) => probeBucket(storage, secret),
    })
  );

  ipcMain.handle("backup:list", (_event, serverId: unknown) => {
    if (serverId === null) {
      return organizationBackups();
    }

    return known(serverId)
      ? serverBackups(serverId)
      : refuseWith("bad_request", "refusal.server.unknown");
  });

  ipcMain.handle(
    "backup:restore-setup",
    (
      event,
      token: unknown,
      serverId: unknown,
      backupId: unknown,
      passphrase: unknown,
      options: unknown
    ) => {
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

  ipcMain.handle(
    "backup:restore-data",
    (
      event,
      token: unknown,
      serverId: unknown,
      backupId: unknown,
      parts: unknown,
      passphrase: unknown
    ) => {
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
          typeof passphrase === "string" && passphrase ? passphrase : null,
          (update: Event) => relay({ event: update, kind: "event" }),
          restoreDeps
        )
      );
    }
  );

  ipcMain.handle("backup:restore-abort", async (_event, serverId: unknown) => {
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
