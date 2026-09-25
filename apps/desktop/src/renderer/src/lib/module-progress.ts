import type {
  Event,
  StepStatus,
} from "@pupitre/shared/agent-protocol/envelope";

export interface StepEntry {
  step: string;
  status: StepStatus;
  ms: number;
  replay?: string;
  /** The raw line behind a `fail`, or the warning an `ok` carries. */
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

export function started(modules: readonly string[]): ModuleProgress[] {
  return modules.map((id) => ({ id, ms: 0, status: "running", steps: [] }));
}

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

/** Closes the latest open step of that name, never an older one a lost event left open. */
export function withStep(steps: StepEntry[], entry: StepEntry): StepEntry[] {
  const open = lastOpen(steps, entry.step);

  if (entry.status === "start" || open === -1) {
    return [...steps, entry];
  }

  return steps.map((candidate, index) => (index === open ? entry : candidate));
}

function lastOpen(steps: readonly StepEntry[], step: string): number {
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    const candidate = steps[index];

    if (candidate.step === step && candidate.status === "start") {
      return index;
    }
  }

  return -1;
}

/** The answer ends the run: unclosed steps are dropped so a lost event never leaves a module spinning. */
export function settledBy(
  module: ModuleProgress,
  failed: boolean
): ModuleProgress {
  const closed = shaped(
    module.id,
    module.steps.filter((entry) => entry.status !== "start")
  );

  if (failed) {
    return { ...closed, status: "fail" };
  }

  return closed.status === "pending" ? { ...closed, status: "ok" } : closed;
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
