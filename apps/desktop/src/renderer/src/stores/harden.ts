import type { StepStatus } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentError } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import { create } from "zustand";
import type { StepEntry } from "./install";

/**
 * The hardening as the screen watches it happen.
 *
 * The steps are the agent's own, in its order and its words; `root_closed` and
 * `reason` come back untouched, because a refusal explained by the app would
 * describe the machine we imagine rather than the one that answered.
 */

export type HardenState =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "switching"; serverId: string; user: string }
  | { status: "done"; serverId: string; outcome: HardenOutcome }
  | { status: "failed"; serverId: string; error: AgentError };

type HardenStore = {
  harden: HardenState;
  steps: StepEntry[];

  start: (serverId: string) => Promise<void>;
  reset: () => void;
};

function stepOf(update: HardenUpdate): StepEntry | null {
  if (update.kind !== "event" || update.event.event !== "step") {
    return null;
  }

  const raw = update.event as unknown as {
    step?: unknown;
    status?: unknown;
    ms?: unknown;
  };

  if (typeof raw.step !== "string") {
    return null;
  }

  return {
    ms: typeof raw.ms === "number" ? raw.ms : 0,
    status: raw.status as StepStatus,
    step: raw.step,
  };
}

/** A step closes the one it opened rather than piling up next to it. */
function withStep(steps: StepEntry[], entry: StepEntry): StepEntry[] {
  const open = steps.findIndex(
    (candidate) => candidate.step === entry.step && candidate.status === "start"
  );

  if (entry.status === "start" || open === -1) {
    return [...steps, entry];
  }

  return steps.map((candidate, index) => (index === open ? entry : candidate));
}

export const useHarden = create<HardenStore>((set) => ({
  harden: { status: "idle" },
  steps: [],

  async start(serverId) {
    set({ harden: { serverId, status: "running" }, steps: [] });

    const answer = await window.pupitre.harden(serverId, (update) => {
      if (update.kind === "switching") {
        set({ harden: { serverId, status: "switching", user: update.user } });

        return;
      }

      const entry = stepOf(update);

      if (entry) {
        set((state) => ({ steps: withStep(state.steps, entry) }));
      }
    });

    set({
      harden: answer.ok
        ? { outcome: answer.result, serverId, status: "done" }
        : { error: answer.error, serverId, status: "failed" },
    });
  },

  reset() {
    set({ harden: { status: "idle" }, steps: [] });
  },
}));
