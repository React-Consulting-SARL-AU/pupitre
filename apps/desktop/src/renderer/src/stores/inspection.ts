import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

/**
 * What the probe said about a server.
 *
 * The report is kept as it came: the store adds nothing, corrects nothing, and
 * decides nothing. What the machine did not say, the screen does not show. The
 * last report of each server stays here once read, because the next screens
 * weigh what a service asks against what the machine has.
 */

export type Inspection =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; probe: ProbeResult }
  | { status: "failed"; serverId: string; error: AgentError };

interface InspectionStore {
  inspection: Inspection;
  probes: Record<string, ProbeResult>;

  inspect: (serverId: string) => Promise<void>;
  forget: () => void;
}

export const useInspection = create<InspectionStore>((set) => {
  /** The probe under way, so a second ask for the same machine waits on it. */
  let running: { serverId: string; answer: Promise<void> } | null = null;

  async function probe(serverId: string): Promise<void> {
    set({ inspection: { serverId, status: "running" } });

    const answer = await window.pupitre.inspect(serverId);

    if (!answer.ok) {
      set({ inspection: { error: answer.error, serverId, status: "failed" } });
      return;
    }

    set((state) => ({
      inspection: { probe: answer.result, serverId, status: "done" },
      probes: { ...state.probes, [serverId]: answer.result },
    }));
  }

  return {
    inspection: { status: "idle" },
    probes: {},

    inspect(serverId) {
      if (running?.serverId === serverId) {
        return running.answer;
      }

      const answer = probe(serverId).finally(() => {
        if (running?.answer === answer) {
          running = null;
        }
      });
      running = { answer, serverId };

      return answer;
    },

    /** The screen closes; the reports stay, they describe machines. */
    forget() {
      running = null;
      set({ inspection: { status: "idle" } });
    },
  };
});

export function probeOf(serverId: string | null): ProbeResult | null {
  return serverId ? (useInspection.getState().probes[serverId] ?? null) : null;
}
