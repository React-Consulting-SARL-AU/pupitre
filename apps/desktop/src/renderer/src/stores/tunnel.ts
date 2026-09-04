import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { PortForward } from "@shared/services";
import { create } from "zustand";

/**
 * The two tunnels a server has, which are not the same thing.
 *
 * The agent's own is what puts a project on a public address; the app's own is
 * an `ssh -L` that brings a port of the server to this computer, for a database
 * client the architecture forbids exposing. One is asked of the agent, the
 * other is opened here.
 */

export type TunnelState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; tunnel: TunnelStatusResult }
  | { status: "failed"; error: AgentError };

type TunnelCommand = "tunnel.status" | "tunnel.sync" | "tunnel.restart";

interface TunnelStore {
  tunnel: TunnelState;
  forwards: PortForward[];
  busy: TunnelCommand | null;
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  sync: (serverId: string) => Promise<void>;
  restart: (serverId: string) => Promise<void>;
  readForwards: (serverId: string) => Promise<void>;
  forward: (
    serverId: string,
    remotePort: number,
    label: string
  ) => Promise<void>;
  closeForward: (id: string) => Promise<void>;
  forget: () => void;
}

export const useTunnel = create<TunnelStore>((set) => {
  async function drive(serverId: string, cmd: TunnelCommand): Promise<void> {
    set({ busy: cmd, problem: null });

    const answer = (await window.pupitre.agentCall(
      serverId,
      cmd
    )) as AgentResponse<TunnelStatusResult>;

    set({
      busy: null,
      problem: answer.ok ? null : answer.error,
      tunnel: answer.ok
        ? { status: "ready", tunnel: answer.result }
        : { error: answer.error, status: "failed" },
    });
  }

  return {
    busy: null,
    forwards: [],
    problem: null,
    tunnel: { status: "idle" },

    async read(serverId) {
      set((state) =>
        state.tunnel.status === "ready"
          ? state
          : { ...state, tunnel: { status: "reading" } }
      );

      await drive(serverId, "tunnel.status");
    },

    sync(serverId) {
      return drive(serverId, "tunnel.sync");
    },

    restart(serverId) {
      return drive(serverId, "tunnel.restart");
    },

    async readForwards(serverId) {
      set({ forwards: await window.pupitre.portForwards(serverId) });
    },

    async forward(serverId, remotePort, label) {
      set({ problem: null });

      const answer = await window.pupitre.openPortForward(
        serverId,
        remotePort,
        label
      );

      if (!answer.ok) {
        set({ problem: answer.error });

        return;
      }

      set({ forwards: await window.pupitre.portForwards(serverId) });
    },

    async closeForward(id) {
      set({ forwards: await window.pupitre.closePortForward(id) });
    },

    forget() {
      set({
        busy: null,
        forwards: [],
        problem: null,
        tunnel: { status: "idle" },
      });
    },
  };
});
