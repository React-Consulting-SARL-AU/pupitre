import type { AgentError } from "@shared/agent";
import type {
  CloudflareZone,
  ConnectionKind,
  ConnectionsState,
} from "@shared/cloudflare";
import { NO_CONNECTIONS } from "@shared/cloudflare";
import { create } from "zustand";

/**
 * The third-party accounts the app holds, once for every server.
 *
 * A connection is what a module declares it needs before it can be installed.
 * The token never comes back across the bridge: this store sends it and then
 * knows only which account it opened. What it shows says an account is
 * connected, never with what.
 */

interface ConnectionStore {
  state: ConnectionsState;
  busy: boolean;
  problem: AgentError | null;
  zones: readonly CloudflareZone[];
  zonesFor: string | null;

  read: () => Promise<void>;
  connect: (kind: ConnectionKind, token: string) => Promise<boolean>;
  forget: (kind: ConnectionKind) => Promise<void>;
  loadZones: () => Promise<void>;
  holds: (kind: string) => boolean;
}

export const useConnections = create<ConnectionStore>((set, get) => ({
  busy: false,
  problem: null,
  state: NO_CONNECTIONS,
  zones: [],
  zonesFor: null,

  async read() {
    set({ state: await window.pupitre.connectionsState() });
  },

  async connect(_kind, token) {
    set({ busy: true, problem: null });

    const answer = await window.pupitre.connectAccount(token);

    if (!answer.ok) {
      set({ busy: false, problem: answer.error });

      return false;
    }

    set({ busy: false, problem: null, state: answer.result, zonesFor: null });
    await get().loadZones();

    return true;
  },

  async forget(_kind) {
    set({ busy: true, problem: null });

    const state = await window.pupitre.forgetAccount();

    set({ busy: false, state, zones: [], zonesFor: null });
  },

  /**
   * The zones of the connected account, read when the screen opens rather than
   * remembered: a zone added on Cloudflare this morning is one the form offers
   * this afternoon.
   */
  async loadZones() {
    const held = get().state.cloudflare;

    if (
      held.status !== "connected" ||
      get().zonesFor === held.connection.accountId
    ) {
      return;
    }

    const answer = await window.pupitre.connectionZones();

    if (answer.ok) {
      set({ zones: answer.result, zonesFor: held.connection.accountId });
    }
  },

  holds(kind) {
    return get().state[kind as ConnectionKind]?.status === "connected";
  },
}));
