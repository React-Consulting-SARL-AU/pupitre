import type { ProcessesListResult } from "@pupitre/shared/agent-protocol/processes";
import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";
import { agentCall as call, agentPoll as poll } from "../lib/agent-call";

/**
 * What the server says of itself, in one command.
 *
 * `snapshot` carries the machine, the services, the projects and the sessions
 * together, so the dashboard reads it on a loop and nothing else does. What
 * goes out to the network — the gap with a remote repository — is deliberately
 * not in here: it belongs to the project store, which asks for it on opening a
 * project and when the reader asks again.
 */

export type SnapshotState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | {
      status: "rebooting";
      serverId: string;
      serverName: string;
      /** When the reboot was sent, so a machine that never comes back is not waited on for ever. */
      since: number;
    }
  | {
      status: "ready";
      serverId: string;
      snapshot: SnapshotResult;
      /** The read that last failed, while what is shown is the one before it. */
      stale?: AgentError;
    }
  | { status: "unreachable"; serverId: string; error: AgentError };

export type ProjectAction = "project.up" | "project.down" | "project.restart";

/** How long a rebooting machine is waited on before its silence is a failure. */
export const REBOOT_PATIENCE_MS = 5 * 60_000;

interface SnapshotStore {
  state: SnapshotState;
  processes: ProcessesListResult["processes"];
  /** The last `processes.list` that failed while the table shows the read before it. */
  processesProblem: AgentError | null;
  /**
   * The processes asked to stop that the next read still listed: a stop that
   * did not take is what turns the button into a forced one.
   */
  lingering: readonly number[];
  /** The project or "all" a command is running on, so its buttons wait. */
  busy: string | null;
  /** What the agent refused, kept until the reader dismisses it. */
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  readProcesses: (serverId: string) => Promise<void>;
  /** Starts, stops or restarts a project, "all", or one process of a project. */
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
  /**
   * Which machine the screen is on: an answer from an earlier one is dropped.
   *
   * A slow `snapshot` from the server just left would otherwise land on the
   * dashboard of the one just chosen, and the reader would see a machine that
   * is not the one named in the sidebar.
   */
  let turn = 0;

  /** The pids a stop was sent to, until a read no longer lists them. */
  let stopped = new Set<number>();

  /** Whether the screen is still on this machine: a gesture made on another one reads nothing back. */
  function stillOn(serverId: string): boolean {
    const held = get().state;

    return held.status !== "idle" && held.serverId === serverId;
  }

  function reread(serverId: string): Promise<void> {
    return stillOn(serverId) ? get().read(serverId) : Promise.resolve();
  }

  /** The table is nobody's while no machine is on screen, so it may follow a stop either way. */
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

    /**
     * A failed read does not erase what is on screen: the machine is still the
     * one it was a second ago, and blanking the dashboard on one dropped packet
     * would cost more than showing a state that is one poll old. It is marked
     * stale instead, so the reader knows what they see has stopped moving.
     */
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

      // A machine that was told to reboot is expected to be silent for a
      // while: its refusals are the reboot, not a failure, until it has had
      // more than its share of time to come back.
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

    /**
     * The machine goes away with the command: the channel drops before the
     * answer arrives, and that dropped channel is the sign it worked. A read
     * still in flight describes the machine before the reboot, and is dropped
     * with it. What follows is a wait that says so, by the machine's name,
     * until the next `snapshot` answers and the dashboard comes back.
     */
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

/** The read that failed while the named server's snapshot stays on screen. */
export function staleOf(
  state: SnapshotState,
  serverId: string | null
): AgentError | null {
  return state.status === "ready" && state.serverId === serverId
    ? (state.stale ?? null)
    : null;
}

/** The snapshot on screen, and only the named server's when one is named. */
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

/** The name of the named server while it is being waited on after a reboot. */
export function rebootingOf(
  state: SnapshotState,
  serverId: string | null
): string | null {
  return state.status === "rebooting" && state.serverId === serverId
    ? state.serverName
    : null;
}
