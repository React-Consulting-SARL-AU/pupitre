import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { AgentError } from "@shared/agent";
import type { HardenOutcome, HardenUpdate } from "@shared/harden";
import { create } from "zustand";
import { stepOf as stepFrom, withStep } from "../lib/module-progress";
import type { StepEntry } from "./install";
import { useServers } from "./servers";

export type HardenState =
  | { status: "idle" }
  // Sent, but queued behind a longer command on the same channel.
  | { status: "queued"; serverId: string }
  | { status: "running"; serverId: string }
  | { status: "switching"; serverId: string; user: string }
  | { status: "done"; serverId: string; outcome: HardenOutcome }
  | { status: "failed"; serverId: string; error: AgentError };

interface HardenStore {
  harden: HardenState;
  steps: StepEntry[];

  start: (serverId: string) => Promise<void>;
  reset: () => void;
}

// Hardening steps carry no module name, so one is lent to reuse the install's step reader.
function stepOf(update: HardenUpdate): StepEntry | null {
  if (update.kind !== "event") {
    return null;
  }

  return (
    stepFrom({ ...update.event, module: "harden" } as Event)?.entry ?? null
  );
}

export const useHarden = create<HardenStore>((set) => ({
  harden: { status: "idle" },
  steps: [],

  async start(serverId) {
    set({ harden: { serverId, status: "running" }, steps: [] });

    const answer = await window.pupitre.harden(serverId, (update) => {
      if (update.kind === "queued") {
        set({ harden: { serverId, status: "queued" } });

        return;
      }

      if (update.kind === "switching") {
        set({ harden: { serverId, status: "switching", user: update.user } });

        return;
      }

      const entry = stepOf(update);

      if (entry) {
        set((state) => ({
          harden: { serverId, status: "running" },
          steps: withStep(state.steps, entry),
        }));
      }
    });

    set({
      harden: answer.ok
        ? { outcome: answer.result, serverId, status: "done" }
        : { error: answer.error, serverId, status: "failed" },
    });

    if (answer.ok && answer.result.user) {
      await useServers.getState().load();
    }
  },

  reset() {
    set({ harden: { status: "idle" }, steps: [] });
  },
}));
