import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

export type Inspection =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; probe: ProbeResult }
  | { status: "failed"; serverId: string; error: AgentError };

interface InspectionStore {
  inspection: Inspection;
  // Outlives the screen: later screens weigh services against each machine's last report.
  probes: Record<string, ProbeResult>;

  inspect: (serverId: string) => Promise<void>;
  forget: () => void;
}

export const useInspection = create<InspectionStore>((set) => {
  // Shared so a second ask for the same machine waits on the probe under way.
  let running: { serverId: string; answer: Promise<void> } | null = null;

  async function probe(serverId: string): Promise<void> {
    set({ inspection: { serverId, status: "running" } });

    const answer = await window.pupitre.inspect(serverId);

    if (answer.ok) {
      set((state) => ({
        probes: { ...state.probes, [serverId]: answer.result },
      }));
    }

    // The screen moved on: the report is kept but paints nothing now.
    if (running?.serverId !== serverId) {
      return;
    }

    set({
      inspection: answer.ok
        ? { probe: answer.result, serverId, status: "done" }
        : { error: answer.error, serverId, status: "failed" },
    });
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

    forget() {
      running = null;
      set({ inspection: { status: "idle" } });
    },
  };
});

export function probeOf(serverId: string | null): ProbeResult | null {
  return serverId ? (useInspection.getState().probes[serverId] ?? null) : null;
}
