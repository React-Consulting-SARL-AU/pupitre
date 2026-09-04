import type {
  Shot,
  ShotsCleanResult,
  ShotsListResult,
  ShotsUrlResult,
} from "@pupitre/shared/agent-protocol/processes";
import type { AgentError, AgentResponse } from "@shared/agent";
import { create } from "zustand";

export type ShotsState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; shots: Shot[] }
  | { status: "failed"; serverId: string; error: AgentError };

interface ShotsStore {
  state: ShotsState;
  /** The address the server serves the gallery at, once it has said. */
  gallery: string | null;
  cleaning: boolean;
  /** How many the last cleaning removed, kept until the next reading. */
  removed: number | null;
  problem: AgentError | null;

  read: (serverId: string) => Promise<void>;
  clean: (serverId: string) => Promise<void>;
  openGallery: (serverId: string) => Promise<void>;
  forget: () => void;
}

function call<T>(
  serverId: string,
  cmd: Parameters<Window["pupitre"]["agentCall"]>[1]
): Promise<AgentResponse<T>> {
  return window.pupitre.agentCall(serverId, cmd) as Promise<AgentResponse<T>>;
}

export const useShots = create<ShotsStore>((set, get) => ({
  cleaning: false,
  gallery: null,
  problem: null,
  removed: null,
  state: { status: "idle" },

  async read(serverId) {
    const current = get().state;

    if (current.status === "idle" || current.serverId !== serverId) {
      set({ gallery: null, state: { serverId, status: "loading" } });
    }

    const answer = await call<ShotsListResult>(serverId, "shots.list");

    set({
      removed: null,
      state: answer.ok
        ? { serverId, shots: answer.result.shots, status: "read" }
        : { error: answer.error, serverId, status: "failed" },
    });
  },

  async clean(serverId) {
    set({ cleaning: true, problem: null });

    const answer = await call<ShotsCleanResult>(serverId, "shots.clean");

    set({
      cleaning: false,
      problem: answer.ok ? null : answer.error,
    });

    await get().read(serverId);

    if (answer.ok) {
      set({ removed: answer.result.removed });
    }
  },

  // The address is the server's own: the app never builds one.
  async openGallery(serverId) {
    const answer = await call<ShotsUrlResult>(serverId, "shots.url");

    if (!answer.ok) {
      set({ problem: answer.error });

      return;
    }

    set({ gallery: answer.result.url, problem: null });
    await window.pupitre.openUrl(answer.result.url);
  },

  forget() {
    set({
      cleaning: false,
      gallery: null,
      problem: null,
      removed: null,
      state: { status: "idle" },
    });
  },
}));
