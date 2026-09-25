import type { TunnelStatusResult } from "@pupitre/shared/agent-protocol/secrets";
import type { AgentError, AgentResponse } from "@shared/agent";
import type { PortForward } from "@shared/services";
import { create } from "zustand";

export type TunnelState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "ready"; tunnel: TunnelStatusResult }
  | { status: "failed"; error: AgentError };

type TunnelCommand = "tunnel.status" | "tunnel.sync";

interface TunnelStore {
  tunnel: TunnelState;
  forwards: PortForward[];
  busy: TunnelCommand | null;
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  sync: (serverId: string) => Promise<void>;
  follow: () => () => void;
  readForwards: () => Promise<void>;
  forward: (
    serverId: string,
    remotePort: number,
    label: string
  ) => Promise<void>;
  closeForward: (id: string) => Promise<void>;
  forget: () => void;
}

export function forwardsOf(
  forwards: readonly PortForward[],
  serverId: string | null
): PortForward[] {
  return forwards.filter((forward) => forward.serverId === serverId);
}

export const useTunnel = create<TunnelStore>((set, get) => {
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

    // The app holds the Cloudflare token, so it writes the DNS records for the routes the agent serves.
    async sync(serverId) {
      await drive(serverId, "tunnel.sync");

      const { tunnel } = get();

      if (
        tunnel.status !== "ready" ||
        tunnel.tunnel.provider !== "cloudflare"
      ) {
        return;
      }

      set({ busy: "tunnel.sync" });

      const written = await window.pupitre.syncTunnelRecords(
        serverId,
        tunnel.tunnel.routes
      );

      set({ busy: null, problem: written.ok ? null : written.error });
    },

    follow() {
      const stop = window.pupitre.onPortForwards((forwards) =>
        set({ forwards })
      );

      get().readForwards();

      return stop;
    },

    async readForwards() {
      set({ forwards: await window.pupitre.portForwards() });
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

      set({ forwards: await window.pupitre.portForwards() });
    },

    async closeForward(id) {
      set({ forwards: await window.pupitre.closePortForward(id) });
    },

    // Forwards belong to this computer, not to a server, so they survive a switch.
    forget() {
      set({
        busy: null,
        problem: null,
        tunnel: { status: "idle" },
      });
    },
  };
});
