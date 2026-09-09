import type {
  Event,
  StepStatus,
} from "@pupitre/shared/agent-protocol/envelope";

/**
 * The `step` events of a module run, folded into what a screen draws.
 *
 * `install`, `upgrade` and `uninstall` all report the same way, so the shape
 * they are read into is shared rather than written once per command: the same
 * rows, the same counters, the same reading of what a module's steps add up to.
 */

export interface StepEntry {
  step: string;
  status: StepStatus;
  ms: number;
  replay?: string;
  /** What the agent said of the step: the raw line behind a `fail`, or the warning an `ok` carries. */
  message?: string;
}

export type ModuleStatus = "pending" | "running" | "ok" | "skip" | "fail";

export interface ModuleProgress {
  id: string;
  status: ModuleStatus;
  ms: number;
  steps: StepEntry[];
}

export const TERMINAL_STATUSES: readonly ModuleStatus[] = [
  "ok",
  "skip",
  "fail",
];

export function pending(modules: readonly string[]): ModuleProgress[] {
  return modules.map((id) => ({ id, ms: 0, status: "pending", steps: [] }));
}

/**
 * A module's fate, read off its own steps.
 *
 * One failed step condemns the module however the rest went; a module all of
 * whose steps were skipped had nothing to do. An open `start` means it is still
 * at work.
 */
export function statusOf(steps: readonly StepEntry[]): ModuleStatus {
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

export function shaped(id: string, steps: StepEntry[]): ModuleProgress {
  return { id, ms: spent(steps), status: statusOf(steps), steps };
}

/**
 * A step closes the one it opened rather than piling up next to it: `start` and
 * `ok` are the same step seen twice, and the list is what the reader counts.
 */
export function withStep(steps: StepEntry[], entry: StepEntry): StepEntry[] {
  const open = steps.findIndex(
    (candidate) => candidate.step === entry.step && candidate.status === "start"
  );

  if (entry.status === "start" || open === -1) {
    return [...steps, entry];
  }

  return steps.map((candidate, index) => (index === open ? entry : candidate));
}

export function record(
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

/** The `step` event of the protocol, or nothing if this event is another one. */
export function stepOf(
  event: Event
): { module: string; entry: StepEntry } | null {
  if (event.event !== "step") {
    return null;
  }

  const raw = event as unknown as {
    module?: unknown;
    step?: unknown;
    status?: unknown;
    ms?: unknown;
    replay?: unknown;
    message?: unknown;
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
      ...(typeof raw.message === "string" ? { message: raw.message } : {}),
    },
    module: raw.module,
  };
}

export function doneCount(modules: readonly ModuleProgress[]): number {
  return modules.filter((module) => TERMINAL_STATUSES.includes(module.status))
    .length;
}

export function elapsedMs(modules: readonly ModuleProgress[]): number {
  return modules.reduce((total, module) => total + module.ms, 0);
}
