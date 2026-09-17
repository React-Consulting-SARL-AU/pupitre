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

/**
 * What separates the agent this app can offer from the one the server runs.
 *
 * The comparison is the main process's — it reads the platform and holds the
 * embedded release — and this store keeps its answer as it came. An app behind
 * the server is a fact to show, not a state to be in: nothing here gates a
 * screen, so a reader on an older app goes on driving everything the agent
 * still understands.
 */

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

/**
 * The configuration on the server, brought to the shape the agent now reads.
 *
 * `upgradeAgent` already asks for it: this is what the reader sees of that
 * answer, and what a second attempt writes back after a migration refused.
 * `result` is null for an agent from before the ledger.
 */
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

/** Every piece of state here names its machine, or is nothing. */
type Keyed = { status: "idle" } | { status: string; serverId: string };

/** What the named machine's screens may show of a state: another machine's is nothing. */
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
  /** The agent's own lines while it replaces itself, in order. */
  journal: string[];
  steps: ModuleProgress[];
  /** Set by the reader who closed the banner; a new version reopens it. */
  hidden: string | null;

  read: (serverId: string) => Promise<void>;
  /**
   * The same read on a beat: a server upgraded from another computer, or a
   * release published since, reaches the banner without a relaunch. It steps
   * aside while an upgrade or a migration of this app's own is under way.
   */
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
  /** Which machine the banner is on: an answer from an earlier one is dropped. */
  let turn = 0;

  /** The read under way, so the beat, a focus and a visibility change share one. */
  let reading: { serverId: string; answer: Promise<void> } | null = null;

  /** Whether the banner is still on this machine: a gesture made on another one reads nothing back. */
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

    /**
     * The channel drops when the agent restarts, and a dropped channel is not a
     * failure here: the answer arrives before the restart, and the next read is
     * what confirms which version came back up.
     */
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

    /**
     * The second attempt, after a migration refused. The first one went with
     * the upgrade, and the agent had already run it when it started.
     */
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

/**
 * Whether the banner has anything to say: a server whose configuration is not
 * the shape its agent reads is always said — nothing can be driven on it until
 * that is settled, and it is never something the reader can put away — a server
 * the sheet says this app can no longer drive is always said, an app ahead of
 * the server has an update to offer, an app behind it has one to ask for. The
 * rest is silence.
 */
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
