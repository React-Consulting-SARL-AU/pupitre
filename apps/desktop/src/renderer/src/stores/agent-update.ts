import type { Event } from "@pupitre/shared/agent-protocol/envelope";
import type { InstallResult } from "@pupitre/shared/agent-protocol/install";
import type { AgentMigrateResult } from "@pupitre/shared/agent-protocol/migrate";
import type { AgentError } from "@shared/agent";
import type {
  AgentUpdateState,
  AgentUpgradeOutcome,
} from "@shared/agent-update";
import { owesMigration } from "@shared/agent-update";
import { create } from "zustand";
import {
  type ModuleProgress,
  pending,
  record,
  stepOf,
} from "../lib/module-progress";

export type UpdateState =
  | { status: "idle" }
  | { status: "reading"; serverId: string }
  | { status: "ready"; serverId: string; update: AgentUpdateState }
  | { status: "failed"; serverId: string; error: AgentError };

export type UpgradeState =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; result: AgentUpgradeOutcome }
  | { status: "failed"; serverId: string; error: AgentError };

// `result` is null for an agent older than the migration ledger.
export type MigrationState =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; result: AgentMigrateResult | null }
  | { status: "failed"; serverId: string; error: AgentError };

export type ModulesState =
  | { status: "idle" }
  | { status: "running"; serverId: string }
  | { status: "done"; serverId: string; result: InstallResult }
  | { status: "failed"; serverId: string; error: AgentError };

type Keyed = { status: "idle" } | { status: string; serverId: string };

export function ofServer<T extends Keyed>(
  state: T,
  serverId: string | null
): T | { status: "idle" } {
  return "serverId" in state && state.serverId === serverId
    ? state
    : { status: "idle" };
}

interface AgentUpdateStore {
  state: UpdateState;
  upgrade: UpgradeState;
  migration: MigrationState;
  modules: ModulesState;
  journal: string[];
  steps: ModuleProgress[];
  // The dismissed offer's version, so a newer release reopens the banner.
  hidden: string | null;

  read: (serverId: string) => Promise<void>;
  refresh: (serverId: string) => Promise<void>;
  upgradeAgent: (serverId: string) => Promise<void>;
  migrateConfig: (serverId: string) => Promise<void>;
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
  // Bumped when the banner changes machine, so an earlier machine's answer is dropped.
  let turn = 0;

  // Shared so the beat, a focus and a visibility change trigger a single read.
  let reading: { serverId: string; answer: Promise<void> } | null = null;

  function stillOn(serverId: string): boolean {
    const { state } = get();

    return state.status !== "idle" && state.serverId === serverId;
  }

  function reread(serverId: string): Promise<void> {
    return stillOn(serverId) ? get().read(serverId) : Promise.resolve();
  }

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
    migration: { status: "idle" },
    modules: { status: "idle" },
    state: { status: "idle" },
    steps: [],
    upgrade: { status: "idle" },

    read(serverId) {
      if (reading?.serverId === serverId) {
        return reading.answer;
      }

      const current = get().state;

      if (current.status === "idle" || current.serverId !== serverId) {
        turn += 1;
        set({ state: { serverId, status: "reading" } });
      }

      const asked = turn;
      const answer = window.pupitre
        .agentUpdateState(serverId)
        .then((answered) => {
          if (asked !== turn) {
            return;
          }

          set({
            state: answered.ok
              ? { serverId, status: "ready", update: answered.result }
              : { error: answered.error, serverId, status: "failed" },
          });
        })
        .finally(() => {
          if (reading?.answer === answer) {
            reading = null;
          }
        });

      reading = { answer, serverId };

      return answer;
    },

    async refresh(serverId) {
      const { migration, upgrade } = get();

      if (upgrade.status === "running" || migration.status === "running") {
        return;
      }

      await get().read(serverId);
    },

    // The channel drops as the agent restarts; the next read confirms which version came back.
    async upgradeAgent(serverId) {
      set({
        journal: [],
        migration: { serverId, status: "running" },
        upgrade: { serverId, status: "running" },
      });

      const answer = await window.pupitre.upgradeAgent(serverId, note);

      set({
        migration: answer.ok
          ? { result: answer.result.migration, serverId, status: "done" }
          : { status: "idle" },
        upgrade: answer.ok
          ? { result: answer.result, serverId, status: "done" }
          : { error: answer.error, serverId, status: "failed" },
      });

      if (answer.ok) {
        await reread(serverId);
      }
    },

    // Only a retry: the first migration already ran when the upgraded agent started.
    async migrateConfig(serverId) {
      set({ migration: { serverId, status: "running" } });

      const answer = await window.pupitre.migrateAgentConfig(serverId);

      set({
        migration: answer.ok
          ? { result: answer.result, serverId, status: "done" }
          : { error: answer.error, serverId, status: "failed" },
      });

      await reread(serverId);
    },

    async upgradeModules(serverId, modules) {
      set({
        modules: { serverId, status: "running" },
        steps: pending(modules),
      });

      const answer = await window.pupitre.upgradeModules(
        serverId,
        modules,
        note
      );

      set({
        modules: answer.ok
          ? { result: answer.result, serverId, status: "done" }
          : { error: answer.error, serverId, status: "failed" },
      });
    },

    hide() {
      const current = get().state;

      set({
        hidden:
          current.status === "ready"
            ? (current.update.offer?.version ?? null)
            : null,
      });
    },

    forget() {
      turn += 1;
      reading = null;

      set({
        journal: [],
        migration: { status: "idle" },
        modules: { status: "idle" },
        state: { status: "idle" },
        steps: [],
        upgrade: { status: "idle" },
      });
    },
  };
});

export function announces(state: UpdateState, hidden: string | null): boolean {
  if (state.status !== "ready") {
    return false;
  }

  const { config, offer, order, verdict } = state.update;

  if (owesMigration(config)) {
    return true;
  }

  if (verdict === "agent_too_old") {
    return true;
  }

  if (order === "ahead") {
    return offer !== null && offer.version !== hidden;
  }

  return order === "behind";
}
