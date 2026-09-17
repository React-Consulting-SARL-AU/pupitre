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
  settledBy,
  shaped,
  stepOf,
  TERMINAL_STATUSES,
} from "../lib/module-progress";
import { useCatalog } from "./catalog";
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
  /** A refusal took the typed secrets with it: the screen says so next to the way back. */
  secretsDropped: boolean;
  /** How long to wait between two readings of a report still being written. */
  pollMs: number;

  start: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    /** Modules to put on the machine without configuring: their questions wait. */
    defer?: readonly string[]
  ) => Promise<void>;
  /** The catalogue's choice, once its generated secrets have landed. */
  startChosen: (serverId: string) => Promise<void>;
  /** The configuration is given again when the reader has just retyped it. */
  replay: (
    serverId: string,
    moduleId: string,
    config?: ModuleConfig
  ) => Promise<void>;
  /** Runs every module that failed again, with the configuration it was given. */
  replayFailed: (serverId: string) => Promise<void>;
  /**
   * Reads the report back, which is what a channel that dropped left behind —
   * and reads it again while the machine is still writing it.
   */
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

const REPORT_POLL_MS = 3000;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  if (update.kind === "secrets") {
    return null;
  }

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
 * Nothing waits once the agent has answered. A module it said little of — an
 * agent that emits no steps, a channel that swallowed them, a step whose end
 * never came back — takes the fate the result gives it, so the list agrees with
 * the sentence under it and no step is left turning under an install that is
 * over.
 */
function settled(
  modules: readonly ModuleProgress[],
  ran: readonly string[],
  result: InstallResult
): ModuleProgress[] {
  return modules.map((module) => {
    if (TERMINAL_STATUSES.includes(module.status) || !ran.includes(module.id)) {
      return module;
    }

    return settledBy(module, result.failed.includes(module.id));
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
  /** Which reading of the report is the current one: an older one stops. */
  let reading = 0;

  /** What the main process last said of its vault: whether the typed secrets are still in it. */
  let vaultHeld = false;

  /**
   * The report, read until it is finished.
   *
   * An empty `finished_at` is a machine still at work — after a channel the
   * app gave up on, or on an install another session of the app left running.
   * The screen shows what the report says, then asks again, and settles only
   * on the report of a run that is over.
   */
  async function follow(serverId: string): Promise<void> {
    reading += 1;
    const turn = reading;

    for (;;) {
      const answer = await window.pupitre.installReport(serverId);

      if (turn !== reading) {
        return;
      }

      if (!answer.ok) {
        set({ install: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      const finished = answer.result.finished_at !== "";

      set({
        install: finished
          ? {
              result: {
                failed: answer.result.failed,
                report_path: answer.result.report_path,
                warned: answer.result.warned,
              },
              serverId,
              status: "done",
            }
          : { serverId, status: "running" },
        modules: fromReport(answer.result.modules),
      });

      if (finished) {
        return;
      }

      await delay(get().pollMs);

      if (turn !== reading) {
        return;
      }
    }
  }

  function note(update: InstallUpdate): void {
    if (update.kind === "secrets") {
      vaultHeld = update.held;

      return;
    }

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

    reading += 1;

    set((state) => ({
      install: { serverId, status: "running" },
      log: again ? state.log : [],
      secretsDropped: false,
      modules: again
        ? state.modules.map((module) =>
            modules.includes(module.id) ? pending([module.id])[0] : module
          )
        : pending(modules),
    }));

    vaultHeld = false;

    const answer = await window.pupitre.startInstall(
      serverId,
      modules,
      config,
      note,
      defer
    );

    // A machine already installing is not a machine that refused: the run this
    // app started before it was closed, or another session's, is followed to
    // its end rather than reported as a failure.
    if (!answer.ok && answer.error.code === "busy") {
      await follow(serverId);

      return;
    }

    // A configuration the agent refused names its fields: the form marks them,
    // as it would have had `install.check` caught them first.
    if (!answer.ok && answer.error.remedy?.code === "invalid_fields") {
      useCatalog.getState().noteProblems(answer.error.remedy.problems);
    }

    // The secrets left the vault with the request: a refusal loses them, and a
    // form that still said "filled" would send the next attempt without them.
    if (!(answer.ok || vaultHeld)) {
      const catalog = useCatalog.getState();

      set({ secretsDropped: catalog.typedSecrets() });
      catalog.dropSecrets();
    }

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

  /** What was put off the first time stays off: a deferred module is replayed as deferred. */
  function deferredOf(modules: readonly string[]): string[] {
    return get().requested.defer.filter((id) => modules.includes(id));
  }

  /** A configuration given again is the one every later replay runs with. */
  function remember(config: ModuleConfig): void {
    set((state) => ({
      requested: {
        ...state.requested,
        config: { ...state.requested.config, ...config },
      },
    }));
  }

  return {
    install: { status: "idle" },
    log: [],
    modules: [],
    pollMs: REPORT_POLL_MS,
    requested: EMPTY,
    secretsDropped: false,

    async start(serverId, modules, config, defer = []) {
      set({ requested: { config, defer, modules } });

      await run(serverId, modules, config, false, defer);
    },

    async replay(serverId, moduleId, config) {
      if (!get().requested.modules.includes(moduleId)) {
        return;
      }

      if (config?.[moduleId]) {
        remember({ [moduleId]: { ...config[moduleId] } });
      }

      await run(
        serverId,
        [moduleId],
        replayOf([moduleId]),
        true,
        deferredOf([moduleId])
      );
    },

    async replayFailed(serverId) {
      const modules = get().failed();

      if (modules.length === 0) {
        return;
      }

      await run(
        serverId,
        modules,
        replayOf(modules),
        true,
        deferredOf(modules)
      );
    },

    reload(serverId) {
      return follow(serverId);
    },

    async startChosen(serverId) {
      const catalog = useCatalog.getState();
      const asked = catalog.selected;

      await catalog.settled();
      await get().start(
        serverId,
        asked,
        catalog.config(),
        catalog.deferred.filter((one) => asked.includes(one))
      );
    },

    reset() {
      reading += 1;

      set({
        install: { status: "idle" },
        log: [],
        modules: [],
        requested: EMPTY,
        secretsDropped: false,
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
