import type {
  InstallResult,
  ModuleConfig,
  ModuleReport,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentError } from "@shared/agent";
import type { InstallUpdate } from "@shared/install";
import { create } from "zustand";
import { humanBytes, humanMs } from "../lib/duration";
import {
  doneCount,
  elapsedMs,
  type ModuleProgress,
  pending,
  record,
  type StepEntry,
  shaped,
  stepOf,
} from "../lib/module-progress";

/**
 * The installation as the screen watches it happen.
 *
 * Everything here came from the agent's `step` events, or from the report read
 * back after a cut — the two are drawn the same way on purpose, so a screen
 * that lost its channel and found it again looks like one that never lost it.
 * Nothing of what the reader typed as a secret ever reaches this store: the
 * install carries only the plain configuration, and the secret line is written
 * by the main process.
 */

export type {
  ModuleProgress,
  ModuleStatus,
  StepEntry,
} from "../lib/module-progress";

export type InstallState =
  | { status: "idle" }
  | { status: "sending"; serverId: string; arch: string }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; result: InstallResult }
  | { status: "failed"; serverId: string; error: AgentError };

interface Requested {
  modules: readonly string[];
  config: ModuleConfig;
}

interface InstallStore {
  install: InstallState;
  modules: ModuleProgress[];
  log: string[];
  requested: Requested;

  start: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig
  ) => Promise<void>;
  /** The configuration is given again when the reader has just retyped it. */
  replay: (
    serverId: string,
    moduleId: string,
    config?: ModuleConfig
  ) => Promise<void>;
  /** Reads the report back, which is what a channel that dropped left behind. */
  reload: (serverId: string) => Promise<void>;
  reset: () => void;

  counts: () => { done: number; total: number };
  elapsed: () => number;
  failed: () => readonly string[];
  warned: () => readonly string[];
}

const LOG_KEPT = 500;

function fromReport(reports: readonly ModuleReport[]): ModuleProgress[] {
  return reports.map((report) =>
    shaped(
      report.id,
      report.steps.map((step) => ({
        ms: step.ms,
        status: step.status,
        step: step.step,
        ...(step.replay ? { replay: step.replay } : {}),
      }))
    )
  );
}

function stepEvent(
  update: InstallUpdate
): { module: string; entry: StepEntry } | null {
  return update.kind === "event" ? stepOf(update.event) : null;
}

function logLine(update: InstallUpdate): string | null {
  if (update.kind === "sending") {
    return `pupitred linux-${update.arch} → envoi sur le serveur`;
  }

  if (update.kind === "sent") {
    return `pupitred linux-${update.arch} · ${humanBytes(update.bytes)} · installé`;
  }

  if (update.event.event === "log") {
    const line = (update.event as unknown as { line?: unknown }).line;

    return typeof line === "string" ? line : null;
  }

  const step = stepEvent(update);

  if (!step || step.entry.status === "start") {
    return null;
  }

  return `${step.module} · ${step.entry.step} · ${step.entry.status} · ${humanMs(step.entry.ms)}`;
}

const EMPTY: Requested = { config: {}, modules: [] };

export const useInstall = create<InstallStore>((set, get) => {
  function note(update: InstallUpdate): void {
    const line = logLine(update);

    set((state) => ({
      log: line ? [...state.log, line].slice(-LOG_KEPT) : state.log,
    }));

    if (update.kind === "sending") {
      const serverId =
        get().install.status === "idle"
          ? ""
          : (get().install as { serverId: string }).serverId;

      set({ install: { arch: update.arch, serverId, status: "sending" } });

      return;
    }

    const step = stepEvent(update);

    if (!step) {
      return;
    }

    set((state) => ({
      install:
        state.install.status === "sending"
          ? { serverId: state.install.serverId, status: "running" }
          : state.install,
      modules: record(state.modules, step.module, step.entry),
    }));
  }

  async function run(
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig
  ): Promise<void> {
    set({
      install: { serverId, status: "running" },
      log: [],
      modules: pending(modules),
    });

    const answer = await window.pupitre.startInstall(
      serverId,
      modules,
      config,
      note
    );

    set({
      install: answer.ok
        ? { result: answer.result, serverId, status: "done" }
        : { error: answer.error, serverId, status: "failed" },
    });
  }

  return {
    install: { status: "idle" },
    log: [],
    modules: [],
    requested: EMPTY,

    async start(serverId, modules, config) {
      set({ requested: { config, modules } });

      await run(serverId, modules, config);
    },

    async replay(serverId, moduleId, config) {
      const { requested } = get();

      if (!requested.modules.includes(moduleId)) {
        return;
      }

      await run(serverId, [moduleId], {
        [moduleId]: { ...(config?.[moduleId] ?? requested.config[moduleId]) },
      });
    },

    async reload(serverId) {
      const answer = await window.pupitre.installReport(serverId);

      if (!answer.ok) {
        set({ install: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      set({
        install: {
          result: {
            failed: answer.result.failed,
            report_path: answer.result.report_path,
            warned: answer.result.warned,
          },
          serverId,
          status: "done",
        },
        modules: fromReport(answer.result.modules),
      });
    },

    reset() {
      set({
        install: { status: "idle" },
        log: [],
        modules: [],
        requested: EMPTY,
      });
    },

    counts() {
      const { modules } = get();

      return { done: doneCount(modules), total: modules.length };
    },

    elapsed() {
      return elapsedMs(get().modules);
    },

    failed() {
      const { install } = get();

      return install.status === "done" ? install.result.failed : [];
    },

    warned() {
      const { install } = get();

      return install.status === "done" ? install.result.warned : [];
    },
  };
});
