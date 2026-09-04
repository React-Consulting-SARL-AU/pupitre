import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentUpgradeResult } from "@pupitre/shared/agent-protocol/system";
import type { AgentError } from "@shared/agent";
import type { AgentUpdateState } from "@shared/agent-update";
import { create } from "zustand";
import {
  type ModuleProgress,
  pending,
  record,
  stepOf,
} from "../lib/module-progress";

/**
 * What separates the agent this app carries from the one the server runs.
 *
 * The comparison is the main process's — it holds the embedded release — and
 * this store keeps its answer as it came. An app behind the server is a fact to
 * show, not a state to be in: nothing here gates a screen, so a reader on an
 * older app goes on driving everything the agent still understands.
 */

export type UpdateState =
  | { status: "idle" }
  | { status: "reading"; serverId: string }
  | { status: "ready"; serverId: string; update: AgentUpdateState }
  | { status: "failed"; serverId: string; error: AgentError };

export type UpgradeState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: AgentUpgradeResult }
  | { status: "failed"; error: AgentError };

export type ModulesState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: InstallResult }
  | { status: "failed"; error: AgentError };

interface AgentUpdateStore {
  state: UpdateState;
  upgrade: UpgradeState;
  modules: ModulesState;
  /** The agent's own lines while it replaces itself, in order. */
  journal: string[];
  steps: ModuleProgress[];
  /** Set by the reader who closed the banner; a new version reopens it. */
  hidden: string | null;

  read: (serverId: string) => Promise<void>;
  upgradeAgent: (serverId: string) => Promise<void>;
  upgradeModules: (serverId: string, modules: string[]) => Promise<void>;
  hide: () => void;
  forget: () => void;
}

function lineOf(event: Event): string | null {
  const raw = event as unknown as { line?: unknown };

  return event.event === "log" && typeof raw.line === "string"
    ? raw.line
    : null;
}

export const useAgentUpdate = create<AgentUpdateStore>((set, get) => {
  function note(event: Event): void {
    const line = lineOf(event);

    if (line) {
      set((state) => ({ journal: [...state.journal, line] }));
    }

    const step = stepOf(event);

    if (step) {
      set((state) => ({
        steps: record(state.steps, step.module, step.entry),
      }));
    }
  }

  return {
    hidden: null,
    journal: [],
    modules: { status: "idle" },
    state: { status: "idle" },
    steps: [],
    upgrade: { status: "idle" },

    async read(serverId) {
      const current = get().state;

      if (current.status === "idle" || current.serverId !== serverId) {
        set({ state: { serverId, status: "reading" } });
      }

      const answer = await window.pupitre.agentUpdateState(serverId);

      set({
        state: answer.ok
          ? { serverId, status: "ready", update: answer.result }
          : { error: answer.error, serverId, status: "failed" },
      });
    },

    /**
     * The channel drops when the agent restarts, and a dropped channel is not a
     * failure here: the answer arrives before the restart, and the next read is
     * what confirms which version came back up.
     */
    async upgradeAgent(serverId) {
      set({ journal: [], upgrade: { status: "running" } });

      const answer = await window.pupitre.upgradeAgent(serverId, note);

      set({
        upgrade: answer.ok
          ? { result: answer.result, status: "done" }
          : { error: answer.error, status: "failed" },
      });

      if (answer.ok) {
        await get().read(serverId);
      }
    },

    async upgradeModules(serverId, modules) {
      set({ modules: { status: "running" }, steps: pending(modules) });

      const answer = await window.pupitre.upgradeModules(
        serverId,
        modules,
        note
      );

      set({
        modules: answer.ok
          ? { result: answer.result, status: "done" }
          : { error: answer.error, status: "failed" },
      });
    },

    hide() {
      const current = get().state;

      set({
        hidden:
          current.status === "ready"
            ? (current.update.carried?.version ?? null)
            : null,
      });
    },

    forget() {
      set({
        journal: [],
        modules: { status: "idle" },
        state: { status: "idle" },
        steps: [],
        upgrade: { status: "idle" },
      });
    },
  };
});

/**
 * Whether the banner has anything to say: an app ahead of the server has an
 * update to offer, an app behind it has one to ask for. The rest is silence.
 */
export function announces(state: UpdateState, hidden: string | null): boolean {
  if (state.status !== "ready") {
    return false;
  }

  const { carried, order } = state.update;

  if (order === "ahead") {
    return carried !== null && carried.version !== hidden;
  }

  return order === "behind";
}
