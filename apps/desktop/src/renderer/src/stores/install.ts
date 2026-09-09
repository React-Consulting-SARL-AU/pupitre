import type {
  InstallResult,
  ModuleConfig,
  ModuleReport,
} from "@pupitre/shared/agent-protocol/install";
import { translate } from "@renderer/i18n/translate";
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
import { useChannel } from "./channel";

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
  /** What this installation left unconfigured, so a replay leaves it alone too. */
  defer: readonly string[];
}

interface InstallStore {
  install: InstallState;
  modules: ModuleProgress[];
  log: string[];
  requested: Requested;

  start: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    /** Modules to put on the machine without configuring: their questions wait. */
    defer?: readonly string[]
  ) => Promise<void>;
  /** The configuration is given again when the reader has just retyped it. */
  replay: (
    serverId: string,
    moduleId: string,
    config?: ModuleConfig
  ) => Promise<void>;
  /** Runs every module that failed again, with the configuration it was given. */
  replayFailed: (serverId: string) => Promise<void>;
  /** Reads the report back, which is what a channel that dropped left behind. */
  reload: (serverId: string) => Promise<void>;
  reset: () => void;

  counts: () => { done: number; total: number };
  /** Whether a module of this run has already started: the machine has changed. */
  touched: () => boolean;
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
        ...(step.message ? { message: step.message } : {}),
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
    return `pupitred linux-${update.arch} → ${translate()("install.journal.sending")}`;
  }

  if (update.kind === "sent") {
    return `pupitred linux-${update.arch} · ${humanBytes(update.bytes)} · ${translate()("install.journal.installed")}`;
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

const EMPTY: Requested = { config: {}, defer: [], modules: [] };

/**
 * Nothing waits once the agent has answered. A module it said nothing about
 * — an agent that emits no steps, a channel that swallowed them — takes the
 * fate the result gives it, so the list agrees with the sentence under it.
 */
function settled(
  modules: readonly ModuleProgress[],
  ran: readonly string[],
  result: InstallResult
): ModuleProgress[] {
  return modules.map((module) => {
    if (module.status !== "pending" || !ran.includes(module.id)) {
      return module;
    }

    return {
      ...module,
      status: result.failed.includes(module.id) ? "fail" : "ok",
    };
  });
}

/** The earlier result, with the replayed modules judged again. */
function merged(
  before: InstallResult,
  after: InstallResult,
  replayed: readonly string[]
): InstallResult {
  const others = (ids: readonly string[]) =>
    ids.filter((id) => !replayed.includes(id));

  return {
    failed: [...others(before.failed), ...after.failed],
    report_path: after.report_path,
    warned: [...others(before.warned), ...after.warned],
  };
}

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

  /**
   * A replay runs in the list it came from: the module goes back to pending
   * where it stands, the others keep what the agent said of them, and the
   * result is the earlier one with this module's fate corrected.
   */
  async function run(
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    again = false,
    defer: readonly string[] = []
  ): Promise<void> {
    const before = get().install;
    const kept = before.status === "done" ? before.result : null;

    set((state) => ({
      install: { serverId, status: "running" },
      log: again ? state.log : [],
      modules: again
        ? state.modules.map((module) =>
            modules.includes(module.id) ? pending([module.id])[0] : module
          )
        : pending(modules),
    }));

    const answer = await window.pupitre.startInstall(
      serverId,
      modules,
      config,
      note,
      defer
    );

    set((state) => ({
      install: answer.ok
        ? {
            result: kept ? merged(kept, answer.result, modules) : answer.result,
            serverId,
            status: "done",
          }
        : { error: answer.error, serverId, status: "failed" },
      modules: answer.ok
        ? settled(state.modules, modules, answer.result)
        : state.modules,
    }));
  }

  function replayOf(modules: readonly string[]): ModuleConfig {
    const { requested } = get();
    const config: ModuleConfig = {};

    for (const id of modules) {
      config[id] = { ...requested.config[id] };
    }

    return config;
  }

  return {
    install: { status: "idle" },
    log: [],
    modules: [],
    requested: EMPTY,

    async start(serverId, modules, config, defer = []) {
      set({ requested: { config, defer, modules } });

      await run(serverId, modules, config, false, defer);
    },

    async replay(serverId, moduleId, config) {
      if (!get().requested.modules.includes(moduleId)) {
        return;
      }

      await run(
        serverId,
        [moduleId],
        config?.[moduleId]
          ? { [moduleId]: { ...config[moduleId] } }
          : replayOf([moduleId]),
        true
      );
    },

    async replayFailed(serverId) {
      const modules = get().failed();

      if (modules.length === 0) {
        return;
      }

      await run(serverId, modules, replayOf(modules), true);
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

    touched() {
      return get().modules.some((module) => module.status !== "pending");
    },

    elapsed() {
      return elapsedMs(get().modules);
    },

    failed() {
      const { install, modules } = get();

      if (install.status === "done") {
        return install.result.failed;
      }

      return modules
        .filter((module) => module.status === "fail")
        .map((module) => module.id);
    },

    warned() {
      const { install } = get();

      return install.status === "done" ? install.result.warned : [];
    },
  };
});

/**
 * A link that comes back finds the report where the install left it. The app
 * only ever lost sight of the machine, never the machine itself: what the
 * agent did while nobody watched is read back rather than done twice.
 */
useChannel.subscribe((now, before) => {
  const { install, touched, reload } = useInstall.getState();

  if (install.status !== "failed" || !touched()) {
    return;
  }

  const { serverId } = install;

  if (before.states[serverId] === "lost" && now.states[serverId] === "open") {
    reload(serverId);
  }
});
