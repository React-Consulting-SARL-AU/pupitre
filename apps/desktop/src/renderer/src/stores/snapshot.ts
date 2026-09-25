import type { ProcessesListResult } from "@pupitre/shared/agent-protocol/processes";
import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import type { AgentError } from "@shared/agent";
import type { ProjectAction } from "@shared/projects";
import { create } from "zustand";
import { agentCall as call, agentPoll as poll } from "../lib/agent-call";

export type SnapshotState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | {
      status: "rebooting";
      serverId: string;
      serverName: string;
      since: number;
    }
  | {
      status: "ready";
      serverId: string;
      snapshot: SnapshotResult;
      /** The last failed read; `snapshot` is the one before it. */
      stale?: AgentError;
    }
  | { status: "unreachable"; serverId: string; error: AgentError };

export type { ProjectAction } from "@shared/projects";

export const REBOOT_PATIENCE_MS = 5 * 60_000;

interface SnapshotStore {
  state: SnapshotState;
  processes: ProcessesListResult["processes"];
  processesProblem: AgentError | null;
  /** Pids still listed after a stop: their button turns into a forced stop. */
  lingering: readonly number[];
  busy: string | null;
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  readProcesses: (serverId: string) => Promise<void>;
  act: (
    action: ProjectAction,
    serverId: string,
    name: string,
    process?: string
  ) => Promise<void>;
  stopProcess: (
    serverId: string,
    pid: number,
    force?: boolean
  ) => Promise<void>;
  cleanSessions: (serverId: string) => Promise<void>;
  reboot: (serverId: string, serverName: string) => Promise<void>;
  announce: (error: AgentError | null) => void;
  forget: () => void;
}

export const useSnapshot = create<SnapshotStore>((set, get) => {
  // Bumped on every machine switch so a slow answer from the previous server is dropped.
  let turn = 0;

  let stopped = new Set<number>();

  function stillOn(serverId: string): boolean {
    const held = get().state;

    return held.status !== "idle" && held.serverId === serverId;
  }

  function reread(serverId: string): Promise<void> {
    return stillOn(serverId) ? get().read(serverId) : Promise.resolve();
  }

  // With no machine on screen the process table is unowned, so it is re-read anyway.
  function rereadProcesses(serverId: string): Promise<void> {
    return get().state.status === "idle" || stillOn(serverId)
      ? get().readProcesses(serverId)
      : Promise.resolve();
  }

  return {
    busy: null,
    lingering: [],
    problem: null,
    processes: [],
    processesProblem: null,
    state: { status: "idle" },

    // A failed read keeps the last snapshot on screen, marked stale, rather than blanking it.
    async read(serverId) {
      const current = get().state;

      if (current.status === "idle" || current.serverId !== serverId) {
        turn += 1;
        stopped = new Set();

        set({
          lingering: [],
          processes: [],
          processesProblem: null,
          state: { serverId, status: "loading" },
        });
      }

      const asked = turn;
      const answer = await poll<SnapshotResult>(serverId, "snapshot");

      if (asked !== turn) {
        return;
      }

      if (answer.ok) {
        set({ state: { serverId, snapshot: answer.result, status: "ready" } });

        return;
      }

      const held = get().state;

      if (held.status === "ready") {
        set({ state: { ...held, stale: answer.error } });

        return;
      }

      // A rebooting machine is expected to stay silent until its patience runs out.
      if (
        held.status === "rebooting" &&
        Date.now() - held.since < REBOOT_PATIENCE_MS
      ) {
        return;
      }

      set({ state: { error: answer.error, serverId, status: "unreachable" } });
    },

    async readProcesses(serverId) {
      const asked = turn;
      const answer = await poll<ProcessesListResult>(
        serverId,
        "processes.list"
      );

      if (asked !== turn) {
        return;
      }

      if (!answer.ok) {
        set({ processesProblem: answer.error });

        return;
      }

      const listed = new Set(answer.result.processes.map((one) => one.pid));

      stopped = new Set([...stopped].filter((pid) => listed.has(pid)));

      set({
        lingering: [...stopped],
        processes: answer.result.processes,
        processesProblem: null,
      });
    },

    async act(action, serverId, name, process) {
      set({ busy: name, problem: null });

      const answer = await window.pupitre.actOnProject(
        action,
        serverId,
        name,
        process
      );

      set({ busy: null, problem: answer.ok ? null : answer.error });

      await reread(serverId);
    },

    async stopProcess(serverId, pid, force = false) {
      const answer = await call(serverId, "process.kill", {
        pid,
        ...(force ? { force: true } : {}),
      });

      if (answer.ok) {
        stopped.add(pid);
      }

      set({ problem: answer.ok ? null : answer.error });

      await rereadProcesses(serverId);
    },

    async cleanSessions(serverId) {
      const answer = await call(serverId, "sessions.clean");

      set({ problem: answer.ok ? null : answer.error });

      await reread(serverId);
    },

    // The channel drops before the reboot answers, so the answer is ignored: the drop is the success.
    async reboot(serverId, serverName) {
      await call(serverId, "reboot");
      await window.pupitre.agentClose(serverId);

      turn += 1;
      stopped = new Set();

      set({
        lingering: [],
        processes: [],
        processesProblem: null,
        state: { serverId, serverName, since: Date.now(), status: "rebooting" },
      });
    },

    announce(error) {
      set({ problem: error });
    },

    forget() {
      turn += 1;
      stopped = new Set();

      set({
        busy: null,
        lingering: [],
        problem: null,
        processes: [],
        processesProblem: null,
        state: { status: "idle" },
      });
    },
  };
});

export function staleOf(
  state: SnapshotState,
  serverId: string | null
): AgentError | null {
  return state.status === "ready" && state.serverId === serverId
    ? (state.stale ?? null)
    : null;
}

export function snapshotOf(
  state: SnapshotState,
  serverId?: string | null
): SnapshotResult | null {
  if (state.status !== "ready") {
    return null;
  }

  return serverId === undefined || state.serverId === serverId
    ? state.snapshot
    : null;
}

export function rebootingOf(
  state: SnapshotState,
  serverId: string | null
): string | null {
  return state.status === "rebooting" && state.serverId === serverId
    ? state.serverName
    : null;
}
