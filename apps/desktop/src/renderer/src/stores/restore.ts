import type { BackupRestoreDataResult } from "@pupitre/shared/agent-protocol/backup";
import type { AgentError } from "@shared/agent";
import {
  type PlatformBackup,
  type RestoredSetup,
  restoredSetupOf,
} from "@shared/backups";
import { create } from "zustand";
import { type ModuleProgress, record, stepOf } from "../lib/module-progress";
import { restoredConfig } from "../lib/restored-config";
import { useCatalog } from "./catalog";

/**
 * A new server started from a backup, as the onboarding walks it.
 *
 * The backups are the organization's, listed by the platform; the passphrase
 * goes to the main process once, which checks it against the backup's public
 * key before the machine is asked anything. Once the configuration stands, the
 * catalogue and the form open on what the backup held; the data waits for the
 * modules to be installed and the machine hardened.
 */

export type OrganizationBackups =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "read"; backups: PlatformBackup[] }
  | { status: "failed"; error: AgentError };

export type SetupState =
  | { status: "idle" }
  | { status: "running"; backupId: string }
  | { status: "failed"; backupId: string; error: AgentError };

export type DataState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: BackupRestoreDataResult }
  | { status: "failed"; error: AgentError };

interface RestoreStore {
  backups: OrganizationBackups;
  setup: SetupState;
  data: DataState;
  steps: ModuleProgress[];
  /** The backup whose configuration the machine now holds, and the data it still owes. */
  restored: RestoredSetup | null;

  /** How many backups the organization holds; none when the platform could not say. */
  list: () => Promise<number>;
  /** True once the configuration stands and the catalogue holds the backup's choice. */
  start: (
    serverId: string,
    backupId: string,
    passphrase: string
  ) => Promise<boolean>;
  bringData: (
    serverId: string,
    parts: readonly string[],
    passphrase: string | null
  ) => Promise<boolean>;
  abort: (serverId: string) => Promise<void>;
  /** A resumed onboarding takes the restore back from the shelf. */
  adopt: (restored: RestoredSetup | null) => void;
  reset: () => void;
}

export const useRestore = create<RestoreStore>((set, get) => ({
  backups: { status: "idle" },
  data: { status: "idle" },
  restored: null,
  setup: { status: "idle" },
  steps: [],

  async list() {
    set({ backups: { status: "loading" } });

    const answer = await window.pupitre.listBackups(null);

    set({
      backups: answer.ok
        ? { backups: answer.result, status: "read" }
        : { error: answer.error, status: "failed" },
    });

    return answer.ok ? answer.result.length : 0;
  },

  async start(serverId, backupId, passphrase) {
    set({ setup: { backupId, status: "running" } });

    const answer = await window.pupitre.restoreBackupSetup(
      serverId,
      backupId,
      passphrase,
      { revert: false, saveFirst: false },
      () => undefined
    );

    if (!answer.ok) {
      set({ setup: { backupId, error: answer.error, status: "failed" } });

      return false;
    }

    const setup = answer.result;
    const config = await restoredConfig(
      serverId,
      setup.modules.filter((id) => !setup.defer.includes(id))
    );

    if (!config.ok) {
      set({ setup: { backupId, error: config.error, status: "failed" } });

      return false;
    }

    const catalog = useCatalog.getState();

    await catalog.load(serverId, []);
    catalog.adoptRestore({
      deferred: setup.defer,
      held: config.result.held,
      selected: setup.modules,
      values: config.result.values,
    });

    set({ restored: restoredSetupOf(setup), setup: { status: "idle" } });

    return true;
  },

  async bringData(serverId, parts, passphrase) {
    const { restored } = get();

    if (!restored) {
      return false;
    }

    set({ data: { status: "running" }, steps: [] });

    const answer = await window.pupitre.restoreBackupData(
      serverId,
      restored.backupId,
      parts,
      passphrase,
      (event) => {
        const step = stepOf(event);

        if (step) {
          set((state) => ({
            steps: record(state.steps, step.module, step.entry),
          }));
        }
      }
    );

    set({
      data: answer.ok
        ? { result: answer.result, status: "done" }
        : { error: answer.error, status: "failed" },
    });

    return answer.ok;
  },

  async abort(serverId) {
    await window.pupitre.abortRestore(serverId);

    set({ data: { status: "idle" }, restored: null, steps: [] });
  },

  adopt(restored) {
    set({ restored });
  },

  reset() {
    set({
      backups: { status: "idle" },
      data: { status: "idle" },
      restored: null,
      setup: { status: "idle" },
      steps: [],
    });
  },
}));
