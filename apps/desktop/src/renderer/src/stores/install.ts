import type { StepStatus } from "@pupitre/shared/agent-protocol/envelope";
import type {
  InstallResult,
  ModuleConfig,
  ModuleReport,
} from "@pupitre/shared/agent-protocol/install";
import type { AgentError } from "@shared/agent";
import type { InstallUpdate } from "@shared/install";
import { create } from "zustand";
import { humanBytes, humanMs } from "../lib/duration";

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

export type StepEntry = {
  step: string;
  status: StepStatus;
  ms: number;
  replay?: string;
};

export type ModuleStatus = "pending" | "running" | "ok" | "skip" | "fail";

export type ModuleProgress = {
  id: string;
  status: ModuleStatus;
  ms: number;
  steps: StepEntry[];
};

export type InstallState =
  | { status: "idle" }
  | { status: "sending"; serverId: string; arch: string }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; result: InstallResult }
  | { status: "failed"; serverId: string; error: AgentError };

type Requested = {
  modules: readonly string[];
  config: ModuleConfig;
};

type InstallStore = {
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
};

const LOG_KEPT = 500;

const TERMINAL: readonly ModuleStatus[] = ["ok", "skip", "fail"];

function pending(modules: readonly string[]): ModuleProgress[] {
  return modules.map((id) => ({ id, ms: 0, status: "pending", steps: [] }));
}

/**
 * A module's fate, read off its own steps.
 *
 * One failed step condemns the module however the rest went; a module all of
 * whose steps were skipped had nothing to do. An open `start` means it is still
 * at work.
 */
function statusOf(steps: readonly StepEntry[]): ModuleStatus {
  if (steps.length === 0) {
    return "pending";
  }

  if (steps.some((entry) => entry.status === "start")) {
    return "running";
  }

  if (steps.some((entry) => entry.status === "fail")) {
    return "fail";
  }

  return steps.every((entry) => entry.status === "skip") ? "skip" : "ok";
}

function spent(steps: readonly StepEntry[]): number {
  return steps
    .filter((entry) => entry.status !== "start")
    .reduce((total, entry) => total + entry.ms, 0);
}

function shaped(id: string, steps: StepEntry[]): ModuleProgress {
  return { id, ms: spent(steps), status: statusOf(steps), steps };
}

/**
 * A step closes the one it opened rather than piling up next to it: `start` and
 * `ok` are the same step seen twice, and the list is what the reader counts.
 */
function withStep(steps: StepEntry[], entry: StepEntry): StepEntry[] {
  const open = steps.findIndex(
    (candidate) => candidate.step === entry.step && candidate.status === "start"
  );

  if (entry.status === "start" || open === -1) {
    return [...steps, entry];
  }

  return steps.map((candidate, index) => (index === open ? entry : candidate));
}

function record(
  modules: ModuleProgress[],
  moduleId: string,
  entry: StepEntry
): ModuleProgress[] {
  const known = modules.some((module) => module.id === moduleId);
  const list = known
    ? modules
    : [
        ...modules,
        { id: moduleId, ms: 0, status: "pending" as const, steps: [] },
      ];

  return list.map((module) =>
    module.id === moduleId
      ? shaped(moduleId, withStep(module.steps, entry))
      : module
  );
}

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
  if (update.kind !== "event" || update.event.event !== "step") {
    return null;
  }

  const raw = update.event as unknown as {
    module?: unknown;
    step?: unknown;
    status?: unknown;
    ms?: unknown;
    replay?: unknown;
  };

  if (typeof raw.module !== "string" || typeof raw.step !== "string") {
    return null;
  }

  return {
    entry: {
      ms: typeof raw.ms === "number" ? raw.ms : 0,
      status: raw.status as StepStatus,
      step: raw.step,
      ...(typeof raw.replay === "string" ? { replay: raw.replay } : {}),
    },
    module: raw.module,
  };
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

      return {
        done: modules.filter((module) => TERMINAL.includes(module.status))
          .length,
        total: modules.length,
      };
    },

    elapsed() {
      return get().modules.reduce((total, module) => total + module.ms, 0);
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
