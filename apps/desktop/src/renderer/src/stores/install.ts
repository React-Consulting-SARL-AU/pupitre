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
  // Kept so a replay leaves these modules unconfigured too.
  defer: readonly string[];
}

interface InstallStore {
  install: InstallState;
  modules: ModuleProgress[];
  log: string[];
  requested: Requested;
  secretsDropped: boolean;
  pollMs: number;

  start: (
    serverId: string,
    modules: readonly string[],
    config: ModuleConfig,
    defer?: readonly string[]
  ) => Promise<void>;
  startChosen: (serverId: string) => Promise<void>;
  // `config` is passed only when the reader has just retyped it.
  replay: (
    serverId: string,
    moduleId: string,
    config?: ModuleConfig
  ) => Promise<void>;
  replayFailed: (serverId: string) => Promise<void>;
  reload: (serverId: string) => Promise<void>;
  reset: () => void;

  counts: () => { done: number; total: number };
  // True once any module started: the machine has already changed.
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

// Modules the agent said little of take the result's verdict, so no step keeps spinning after the end.
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
  // Bumped by every run and reset, so an older report poll stops.
  let reading = 0;

  let vaultHeld = false;

  // An empty `finished_at` means the machine is still at work: poll until the run is over.
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

  // A replay resets only its modules to pending and merges its verdict into the earlier result.
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

    // Already installing (an earlier run of this app or another session's): follow it, not a failure.
    if (!answer.ok && answer.error.code === "busy") {
      await follow(serverId);

      return;
    }

    if (!answer.ok && answer.error.remedy?.code === "invalid_fields") {
      useCatalog.getState().noteProblems(answer.error.remedy.problems);
    }

    // A refusal empties the vault; marks still saying "filled" would resend without the secrets.
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

  function deferredOf(modules: readonly string[]): string[] {
    return get().requested.defer.filter((id) => modules.includes(id));
  }

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

// A returning channel reads the report back rather than redoing what the agent did unwatched.
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
