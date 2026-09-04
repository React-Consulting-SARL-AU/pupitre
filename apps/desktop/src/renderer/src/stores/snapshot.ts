import type { ProcessesListResult } from "@pupitre/shared/agent-protocol/processes";
import type { SnapshotResult } from "@pupitre/shared/agent-protocol/state";
import type { AgentError, AgentResponse } from "@shared/agent";
import { create } from "zustand";

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
  | { status: "ready"; serverId: string; snapshot: SnapshotResult }
  | { status: "unreachable"; serverId: string; error: AgentError };

export type ProjectAction = "project.up" | "project.down" | "project.restart";

interface SnapshotStore {
  state: SnapshotState;
  processes: ProcessesListResult["processes"];
  /** The project or "all" a command is running on, so its buttons wait. */
  busy: string | null;
  /** What the agent refused, kept until the reader dismisses it. */
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  readProcesses: (serverId: string) => Promise<void>;
  act: (action: ProjectAction, serverId: string, name: string) => Promise<void>;
  stopProcess: (serverId: string, pid: number) => Promise<void>;
  cleanSessions: (serverId: string) => Promise<void>;
  reboot: (serverId: string) => Promise<void>;
  announce: (error: AgentError | null) => void;
  forget: () => void;
}

function call<T>(
  serverId: string,
  cmd: Parameters<Window["pupitre"]["agentCall"]>[1],
  params?: unknown
): Promise<AgentResponse<T>> {
  return window.pupitre.agentCall(serverId, cmd, params) as Promise<
    AgentResponse<T>
  >;
}

export const useSnapshot = create<SnapshotStore>((set, get) => ({
  busy: null,
  problem: null,
  processes: [],
  state: { status: "idle" },

  /**
   * A failed read does not erase what is on screen: the machine is still the
   * one it was a second ago, and blanking the dashboard on one dropped packet
   * would cost more than showing a state that is one poll old.
   */
  async read(serverId) {
    const current = get().state;

    if (current.status === "idle" || current.serverId !== serverId) {
      set({ state: { serverId, status: "loading" } });
    }

    const answer = await call<SnapshotResult>(serverId, "snapshot");

    if (answer.ok) {
      set({ state: { serverId, snapshot: answer.result, status: "ready" } });

      return;
    }

    if (get().state.status !== "ready") {
      set({ state: { error: answer.error, serverId, status: "unreachable" } });
    }
  },

  async readProcesses(serverId) {
    const answer = await call<ProcessesListResult>(serverId, "processes.list");

    if (answer.ok) {
      set({ processes: answer.result.processes });
    }
  },

  async act(action, serverId, name) {
    set({ busy: name, problem: null });

    const answer = await window.pupitre.actOnProject(action, serverId, name);

    set({ busy: null, problem: answer.ok ? null : answer.error });
    await get().read(serverId);
  },

  async stopProcess(serverId, pid) {
    const answer = await call(serverId, "process.kill", { pid });

    set({ problem: answer.ok ? null : answer.error });
    await get().readProcesses(serverId);
  },

  async cleanSessions(serverId) {
    const answer = await call(serverId, "sessions.clean");

    set({ problem: answer.ok ? null : answer.error });
    await get().read(serverId);
  },

  /**
   * The machine goes away with the command: the channel drops before the answer
   * arrives, and that dropped channel is the sign it worked.
   */
  async reboot(serverId) {
    await call(serverId, "reboot");
    await window.pupitre.agentClose(serverId);

    set({
      processes: [],
      state: { serverId, status: "loading" },
    });
  },

  announce(error) {
    set({ problem: error });
  },

  forget() {
    set({
      busy: null,
      problem: null,
      processes: [],
      state: { status: "idle" },
    });
  },
}));

export function snapshotOf(state: SnapshotState): SnapshotResult | null {
  return state.status === "ready" ? state.snapshot : null;
}
