import type { AgentError } from "@shared/agent";
import type {
  FleetServer,
  FleetView,
  Server,
  ServerGrant,
} from "@shared/servers";
import { grantGone, grantPending } from "@shared/servers";
import { create } from "zustand";
import { useServers } from "./servers";

export type FleetState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; view: FleetView }
  | { status: "failed"; error: AgentError };

export type FleetOpening =
  | { status: "idle" }
  | { status: "waiting"; serverId: string }
  | { status: "opened"; serverId: string }
  | { status: "refused"; serverId: string; error: AgentError };

export function fleetView(state: FleetState): FleetView | null {
  return state.status === "read" ? state.view : null;
}

export interface GrantedServer extends Server {
  grant: ServerGrant;
}

/** A released grant keeps its local entry but no longer counts as granted. */
export function grantedServers(state: FleetState): GrantedServer[] {
  const servers = fleetView(state)?.config.servers ?? [];

  return servers.filter((server): server is GrantedServer =>
    Boolean(server.grant && !grantGone(server.grant))
  );
}

/** Still granted but hidden locally, so an accidental removal has a way back. */
export function dismissedGrants(state: FleetState): FleetServer[] {
  const view = fleetView(state);
  const dismissed = new Set(view?.config.dismissed ?? []);

  return view?.granted.filter((server) => dismissed.has(server.id)) ?? [];
}

export function unreachableGrants(state: FleetState): number {
  return fleetView(state)?.granted.filter((server) => !server.host).length ?? 0;
}

interface FleetStore {
  state: FleetState;
  opening: FleetOpening;

  read: () => Promise<void>;
  open: (serverId: string) => Promise<void>;
  restore: () => Promise<void>;
  forgetOpening: () => void;
}

export const useFleet = create<FleetStore>((set, get) => ({
  opening: { status: "idle" },
  state: { status: "idle" },

  async read() {
    if (get().state.status === "idle") {
      set({ state: { status: "reading" } });
    }

    const answer = await window.pupitre.fleet();

    if (!answer.ok) {
      set({ state: { error: answer.error, status: "failed" } });

      return;
    }

    set({ state: { status: "read", view: answer.result } });

    if (answer.result.changed) {
      await useServers.getState().load();
    }

    const opening = get().opening;

    if (opening.status === "waiting") {
      await get().open(opening.serverId);
    }
  },

  async open(serverId) {
    const server = grantedServers(get().state).find(
      (candidate) => candidate.id === serverId
    );

    if (!server) {
      return;
    }

    // While the key is pending nothing is asked of the platform; the next read resumes the open.
    if (grantPending(server.grant)) {
      set({ opening: { serverId, status: "waiting" } });

      return;
    }

    const answer = await window.pupitre.openGrantedServer(serverId);

    if (!answer.ok) {
      set({ opening: { error: answer.error, serverId, status: "refused" } });

      return;
    }

    await useServers.getState().load();

    set({ opening: { serverId, status: "opened" } });
  },

  async restore() {
    const answer = await window.pupitre.restoreGrantedServers();

    if (!answer.ok) {
      return;
    }

    await useServers.getState().load();
    await get().read();
  },

  forgetOpening() {
    set({ opening: { status: "idle" } });
  },
}));
