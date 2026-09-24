import type {
  BackupContentsResult,
  BackupRestoreDataResult,
  BackupRestoreSetupResult,
  BackupRunResult,
  BackupStatusResult,
} from "@pupitre/shared/agent-protocol/backup";
import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import { BACKUP_MODULE_ID } from "@pupitre/shared/backup";
import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentError, AgentResponse } from "@shared/agent";
import { dataParts, type PlatformBackup } from "@shared/backups";
import { create } from "zustand";
import { agentCall } from "../lib/agent-call";
import { type ModuleProgress, record, stepOf } from "../lib/module-progress";
import { restoredConfig } from "../lib/restored-config";
import { useInstall } from "./install";

/**
 * The backups of one server, as its page works with them.
 *
 * Where they stand comes from the agent (`backup.status`), which of them exist
 * from the platform, and the settings from the module's own form. A revert is
 * the one long gesture here: a save of the machine as it stands, the backup's
 * configuration, the install that follows it, the modules the backup does not
 * hold, then the data — each phase said as it runs, and a failure stopping on
 * the agent's own words.
 */

export type StatusState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; backup: BackupStatusResult }
  | { status: "failed"; serverId: string; error: AgentError };

export type ListState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; backups: PlatformBackup[] }
  | { status: "failed"; serverId: string; error: AgentError };

export type ContentsState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; contents: BackupContentsResult }
  | { status: "failed"; serverId: string; error: AgentError };

export type RunState =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; result: BackupRunResult }
  | { status: "failed"; serverId: string; error: AgentError };

export const REVERT_PHASES = [
  "verify",
  "save",
  "setup",
  "install",
  "extra",
  "data",
] as const;

export type RevertPhase = (typeof REVERT_PHASES)[number];

export type RevertState =
  | { status: "idle" }
  | {
      status: "running";
      serverId: string;
      backupId: string;
      phase: RevertPhase;
    }
  /** The backup does not hold these modules: the reader says which go. */
  | { status: "choosing"; serverId: string; backupId: string; extra: string[] }
  /** Refused before anything left this computer: a wrong passphrase, a platform out of reach. */
  | { status: "refused"; serverId: string; backupId: string; error: AgentError }
  | {
      status: "failed";
      serverId: string;
      backupId: string;
      phase: RevertPhase;
      error: AgentError;
    }
  | {
      status: "done";
      serverId: string;
      backupId: string;
      result: BackupRestoreDataResult;
    };

interface BackupsStore {
  /** The server's catalogue: `core.backup`'s form, and the names of the modules a revert installs. */
  modules: readonly Manifest[];
  manifest: Manifest | null;
  state: StatusState;
  /** What the server holds that backups can carry: the checklist of the content section. */
  contents: ContentsState;
  list: ListState;
  run: RunState;
  revert: RevertState;
  /** The steps the agent reported for the current save or restore of data. */
  steps: ModuleProgress[];
  /** The configuration a revert put in place, for the phases that follow it. */
  setup: BackupRestoreSetupResult | null;
  /** Whether the revert under way saves the machine first. */
  saveFirst: boolean;
  removing: string | null;
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  /** Where backups stand, read again; the list too once a backup under way has ended. */
  refresh: (serverId: string) => Promise<void>;
  /** A backup now, known by the name the reader gave it, or by its date. */
  runNow: (serverId: string, name?: string) => Promise<void>;
  remove: (serverId: string, backupId: string) => Promise<void>;
  revertTo: (
    serverId: string,
    backup: PlatformBackup,
    passphrase: string,
    saveFirst: boolean
  ) => Promise<void>;
  /** The modules the backup does not hold, uninstalled or kept, then the data. */
  settleExtra: (
    serverId: string,
    uninstall: readonly string[]
  ) => Promise<void>;
  dismissRevert: () => void;
  dismissRun: () => void;
  forget: () => void;
}

/** A backup of a configuration alone: nothing to bring back after it. */
const NOTHING_RESTORED: BackupRestoreDataResult = {
  failed: [],
  restored: [],
  started: [],
  warnings: [],
};

/** An install that left modules failed is not a machine to pour data into. */
function installFailure(): AgentError | null {
  const { install } = useInstall.getState();

  if (install.status === "failed") {
    return install.error;
  }

  const failed = install.status === "done" ? install.result.failed : [];

  return failed.length > 0
    ? {
        code: "internal",
        message: "refusal.backup.install.failed",
        phrase: {
          id: "refusal.backup.install.failed",
          values: { modules: failed.join(", ") },
        },
      }
    : null;
}

export const useBackups = create<BackupsStore>((set, get) => {
  function note(event: Event): void {
    const step = stepOf(event);

    if (step) {
      set((state) => ({
        steps: record(state.steps, step.module, step.entry),
      }));
    }
  }

  function phase(serverId: string, backupId: string, next: RevertPhase): void {
    set({ revert: { backupId, phase: next, serverId, status: "running" } });
  }

  function fail(
    serverId: string,
    backupId: string,
    at: RevertPhase,
    error: AgentError
  ): void {
    set({
      revert: { backupId, error, phase: at, serverId, status: "failed" },
    });
  }

  async function readList(serverId: string): Promise<void> {
    const answer = await window.pupitre.listBackups(serverId);

    set({
      list: answer.ok
        ? { backups: answer.result, serverId, status: "read" }
        : { error: answer.error, serverId, status: "failed" },
    });
  }

  async function readContents(serverId: string): Promise<void> {
    set((held) => ({
      contents:
        held.contents.status === "read" && held.contents.serverId === serverId
          ? held.contents
          : { serverId, status: "loading" },
    }));

    const answer = await agentCall<BackupContentsResult>(
      serverId,
      "backup.contents"
    );

    set({
      contents: answer.ok
        ? { contents: answer.result, serverId, status: "read" }
        : { error: answer.error, serverId, status: "failed" },
    });
  }

  async function readStatus(serverId: string): Promise<void> {
    const answer = await agentCall<BackupStatusResult>(
      serverId,
      "backup.status"
    );

    set({
      state: answer.ok
        ? { backup: answer.result, serverId, status: "read" }
        : { error: answer.error, serverId, status: "failed" },
    });
  }

  async function readCatalog(serverId: string): Promise<void> {
    const answer = await window.pupitre.catalog(serverId);
    const modules = answer.ok ? answer.result.modules : [];

    set({
      manifest:
        modules.find((module) => module.id === BACKUP_MODULE_ID) ?? null,
      modules,
    });
  }

  async function restoreData(
    serverId: string,
    backupId: string
  ): Promise<void> {
    const setup = get().setup;
    const parts = dataParts(setup?.parts ?? []).map((part) => part.key);

    phase(serverId, backupId, "data");
    set({ steps: [] });

    const answer: AgentResponse<BackupRestoreDataResult> =
      parts.length > 0
        ? await window.pupitre.restoreBackupData(
            serverId,
            backupId,
            parts,
            null,
            note
          )
        : { ok: true, result: NOTHING_RESTORED };

    if (!answer.ok) {
      fail(serverId, backupId, "data", answer.error);

      return;
    }

    set({
      revert: { backupId, result: answer.result, serverId, status: "done" },
    });

    await Promise.all([readStatus(serverId), readList(serverId)]);
  }

  return {
    contents: { status: "idle" },
    list: { status: "idle" },
    manifest: null,
    modules: [],
    problem: null,
    removing: null,
    revert: { status: "idle" },
    run: { status: "idle" },
    saveFirst: true,
    setup: null,
    state: { status: "idle" },
    steps: [],

    async read(serverId) {
      set((held) => ({
        list:
          held.list.status === "read" && held.list.serverId === serverId
            ? held.list
            : { serverId, status: "loading" },
        state:
          held.state.status === "read" && held.state.serverId === serverId
            ? held.state
            : { serverId, status: "loading" },
      }));

      await Promise.all([
        readStatus(serverId),
        readList(serverId),
        readCatalog(serverId),
        readContents(serverId),
      ]);
    },

    async refresh(serverId) {
      const before = get().state;
      const held = before.status === "read" && before.serverId === serverId;
      const answer = await agentCall<BackupStatusResult>(
        serverId,
        "backup.status"
      );

      // A beat that misses keeps what was read: the page does not flicker to an
      // error for one answer that did not come.
      if (!answer.ok) {
        if (!held) {
          set({ state: { error: answer.error, serverId, status: "failed" } });
        }

        return;
      }

      set({ state: { backup: answer.result, serverId, status: "read" } });

      if (held && before.backup.running && !answer.result.running) {
        await readList(serverId);
      }
    },

    async runNow(serverId, name) {
      set({
        revert: { status: "idle" },
        run: { serverId, status: "running" },
        steps: [],
      });

      const answer = (await window.pupitre.agentStream(
        serverId,
        "backup.run",
        name ? { name } : {},
        note
      )) as AgentResponse<BackupRunResult>;

      set({
        run: answer.ok
          ? { result: answer.result, serverId, status: "done" }
          : { error: answer.error, serverId, status: "failed" },
      });

      await Promise.all([readStatus(serverId), readList(serverId)]);
    },

    async remove(serverId, backupId) {
      set({ problem: null, removing: backupId });

      const answer = await agentCall(serverId, "backup.delete", {
        id: backupId,
      });

      set({ problem: answer.ok ? null : answer.error, removing: null });

      await readList(serverId);
    },

    async revertTo(serverId, backup, passphrase, saveFirst) {
      const backupId = backup.id;

      set({ run: { status: "idle" }, saveFirst, setup: null, steps: [] });
      phase(serverId, backupId, "verify");

      const setup = await window.pupitre.restoreBackupSetup(
        serverId,
        backupId,
        passphrase,
        { revert: true, saveFirst },
        (update) => {
          if (update.kind === "phase") {
            phase(serverId, backupId, update.phase);
          } else {
            note(update.event);
          }
        }
      );

      const reached = get().revert;
      const at = reached.status === "running" ? reached.phase : "verify";

      if (!setup.ok) {
        set({
          revert:
            at === "verify"
              ? { backupId, error: setup.error, serverId, status: "refused" }
              : {
                  backupId,
                  error: setup.error,
                  phase: at,
                  serverId,
                  status: "failed",
                },
        });

        return;
      }

      set({ setup: setup.result });
      phase(serverId, backupId, "install");

      const asked = setup.result.modules.filter(
        (id) => !setup.result.defer.includes(id)
      );
      const config = await restoredConfig(serverId, asked);

      if (!config.ok) {
        fail(serverId, backupId, "install", config.error);

        return;
      }

      useInstall.getState().reset();
      await useInstall
        .getState()
        .start(
          serverId,
          setup.result.modules,
          config.result.values,
          setup.result.defer
        );

      const refused = installFailure();

      if (refused) {
        fail(serverId, backupId, "install", refused);

        return;
      }

      if (setup.result.extra.length > 0) {
        set({
          revert: {
            backupId,
            extra: setup.result.extra,
            serverId,
            status: "choosing",
          },
        });

        return;
      }

      await restoreData(serverId, backupId);
    },

    async settleExtra(serverId, uninstall) {
      const { revert } = get();

      if (revert.status !== "choosing") {
        return;
      }

      const { backupId } = revert;

      if (uninstall.length > 0) {
        phase(serverId, backupId, "extra");
        set({ steps: [] });

        const answer = await window.pupitre.agentStream(
          serverId,
          "uninstall",
          { modules: [...uninstall] },
          note
        );

        if (!answer.ok) {
          fail(serverId, backupId, "extra", answer.error);

          return;
        }
      }

      await restoreData(serverId, backupId);
    },

    dismissRevert() {
      set({ revert: { status: "idle" }, setup: null, steps: [] });
    },

    dismissRun() {
      set({ run: { status: "idle" }, steps: [] });
    },

    forget() {
      set({
        list: { status: "idle" },
        contents: { status: "idle" },
        manifest: null,
        modules: [],
        problem: null,
        removing: null,
        revert: { status: "idle" },
        run: { status: "idle" },
        saveFirst: true,
        setup: null,
        state: { status: "idle" },
        steps: [],
      });
    },
  };
});
