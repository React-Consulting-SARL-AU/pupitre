import type { AgentError } from "@shared/agent";
import type { FleetView, Server, ServerGrant } from "@shared/servers";
import { grantPending } from "@shared/servers";
import { create } from "zustand";
import { useOnboarding } from "./onboarding";
import { useServers } from "./servers";

/**
 * The servers the platform grants this account, as the screen reads them.
 *
 * The store builds no address and names no key: the main process merged the
 * platform's list into the local one, and what lives here is that merge plus
 * the single gesture the screen offers — opening one of them, named by its
 * local identifier.
 */

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

/** The servers of the local list the platform has named, and only those. */
export function grantedServers(state: FleetState): GrantedServer[] {
  return (
    fleetView(state)?.config.servers.filter((server): server is GrantedServer =>
      Boolean(server.grant)
    ) ?? []
  );
}

/** Granted, but with no address to reach: the app could not adopt them. */
export function unreachableGrants(state: FleetState): number {
  const view = fleetView(state);

  return view ? view.granted.length - grantedServers(state).length : 0;
}

interface FleetStore {
  state: FleetState;
  opening: FleetOpening;

  read: () => Promise<void>;
  open: (serverId: string) => Promise<void>;
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

    // Nothing is asked of the platform while the key is not there: the wait is
    // the state, and the next read is what ends it.
    if (grantPending(server.grant)) {
      set({ opening: { serverId, status: "waiting" } });
      return;
    }

    const first = !server.grant.opened;
    const answer = await window.pupitre.openGrantedServer(serverId);

    if (!answer.ok) {
      set({ opening: { error: answer.error, serverId, status: "refused" } });
      return;
    }

    await useServers.getState().load();
    set({ opening: { serverId, status: "opened" } });

    if (first) {
      useOnboarding.getState().personalise(serverId);
    }
  },

  forgetOpening() {
    set({ opening: { status: "idle" } });
  },
}));
