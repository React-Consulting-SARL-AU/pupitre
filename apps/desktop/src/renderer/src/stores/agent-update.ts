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
  | { status: "running" }
  | { status: "done"; result: AgentUpgradeOutcome }
  | { status: "failed"; error: AgentError };

/**
 * The configuration on the server, brought to the shape the agent now reads.
 *
 * `upgradeAgent` already asks for it: this is what the reader sees of that
 * answer, and what a second attempt writes back after a migration refused.
 * `result` is null for an agent from before the ledger.
 */
export type MigrationState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: AgentMigrateResult | null }
  | { status: "failed"; error: AgentError };

export type ModulesState =
  | { status: "idle" }
  | { status: "running" }
  | { status: "done"; result: InstallResult }
  | { status: "failed"; error: AgentError };

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
        migration: { status: "running" },
        upgrade: { status: "running" },
      });

      const answer = await window.pupitre.upgradeAgent(serverId, note);

      set({
        migration: answer.ok
          ? { result: answer.result.migration, status: "done" }
          : { status: "idle" },
        upgrade: answer.ok
          ? { result: answer.result, status: "done" }
          : { error: answer.error, status: "failed" },
      });

      if (answer.ok) {
        await get().read(serverId);
      }
    },

    /**
     * The second attempt, after a migration refused. The first one went with
     * the upgrade, and the agent had already run it when it started.
     */
    async migrateConfig(serverId) {
      set({ migration: { status: "running" } });

      const answer = await window.pupitre.migrateAgentConfig(serverId);

      set({
        migration: answer.ok
          ? { result: answer.result, status: "done" }
          : { error: answer.error, status: "failed" },
      });

      await get().read(serverId);
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
            ? (current.update.offer?.version ?? null)
            : null,
      });
    },

    forget() {
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
