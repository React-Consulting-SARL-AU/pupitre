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

type InspectionStore = {
  inspection: Inspection;
  probes: Record<string, ProbeResult>;

  inspect: (serverId: string) => Promise<void>;
  forget: () => void;
};

export const useInspection = create<InspectionStore>((set) => ({
  inspection: { status: "idle" },
  probes: {},

  async inspect(serverId) {
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
  },

  /** The screen closes; the reports stay, they describe machines. */
  forget() {
    set({ inspection: { status: "idle" } });
  },
}));

export function probeOf(serverId: string | null): ProbeResult | null {
  return serverId ? (useInspection.getState().probes[serverId] ?? null) : null;
}
