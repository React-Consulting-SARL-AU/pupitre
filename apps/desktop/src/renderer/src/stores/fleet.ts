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

/**
 * The servers of the local list the platform grants, and only those.
 *
 * An attribution the platform has let go is not one: the entry that carried it
 * was typed here, so it keeps its place in the list below — but this panel
 * says what the organization gives, and it no longer gives that.
 */
export function grantedServers(state: FleetState): GrantedServer[] {
  const servers = fleetView(state)?.config.servers ?? [];

  return servers.filter((server): server is GrantedServer =>
    Boolean(server.grant && !grantGone(server.grant))
  );
}

export interface FleetGroup {
  id: string;
  name: string;
  servers: GrantedServer[];
}

/**
 * The granted servers, gathered under the organization that carries each.
 *
 * A member of one organization sees one group and no heading; a member of
 * several sees where every machine comes from without opening the console. A
 * server granted before the platform said so keeps its place, unnamed.
 */
export function fleetGroups(state: FleetState): FleetGroup[] {
  const groups: FleetGroup[] = [];

  for (const server of grantedServers(state)) {
    const organization = server.grant.organization;
    const id = organization?.id ?? "";
    const held = groups.find((group) => group.id === id);

    if (held) {
      held.servers.push(server);

      continue;
    }

    groups.push({ id, name: organization?.name ?? "", servers: [server] });
  }

  return groups;
}

/**
 * Granted servers that were removed from this computer.
 *
 * The platform still grants them; it is the local list that hides them. The
 * panel gives their count and offers the way back, otherwise an accidental
 * removal would have none.
 */
export function dismissedGrants(state: FleetState): FleetServer[] {
  const view = fleetView(state);
  const dismissed = new Set(view?.config.dismissed ?? []);

  return view?.granted.filter((server) => dismissed.has(server.id)) ?? [];
}

/** Granted, but with no address to reach: the app could not adopt them. */
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

    // Nothing is asked of the platform while the key is not there: the wait is
    // the state, and the next read is what ends it.
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
