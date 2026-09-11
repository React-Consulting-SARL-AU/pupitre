import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentError } from "@shared/agent";
import type { CloudflareZone } from "@shared/cloudflare";
import type { ConnectionKind, ConnectionsState } from "@shared/connections";
import { NO_CONNECTIONS } from "@shared/connections";
import { create } from "zustand";

/**
 * The third-party accounts the app holds, once for every server.
 *
 * A connection is what a module declares it needs before it can be installed.
 * The token never comes back across the bridge: this store sends it and then
 * knows only which account it opened. What it shows says an account is
 * connected, never with what.
 */

/** What the provider said the last time it was asked about a held token. */
export type ConnectionHealth =
  | { status: "checking" }
  | { status: "answered"; account: string; at: number }
  | { status: "unaskable" }
  | { status: "refused"; error: AgentError };

interface ConnectionStore {
  state: ConnectionsState;
  busy: boolean;
  problem: AgentError | null;
  zones: readonly CloudflareZone[];
  zonesFor: string | null;
  health: Partial<Record<ConnectionKind, ConnectionHealth>>;

  read: () => Promise<void>;
  connect: (kind: ConnectionKind, token: string) => Promise<boolean>;
  forget: (kind: ConnectionKind) => Promise<void>;
  /** Asks the provider whether the token still opens an account. */
  verify: (kind: ConnectionKind) => Promise<void>;
  loadZones: () => Promise<void>;
  holds: (kind: string) => boolean;
}

/**
 * What forgetting an account takes away, said before it is taken: the installed
 * modules of a server that declare this connection, by the manifests the
 * agent gave. A catalogue not read answers no module, not none.
 */
export function forgetScope(
  kind: ConnectionKind,
  installed: readonly string[],
  manifests: readonly Manifest[] | null
): { modules: readonly string[]; known: boolean } {
  if (!manifests) {
    return { known: false, modules: [] };
  }

  const declaring = new Set(
    manifests
      .filter((manifest) => manifest.connection === kind)
      .map((manifest) => manifest.id)
  );

  return {
    known: true,
    modules: installed.filter((id) => declaring.has(id)),
  };
}

export const useConnections = create<ConnectionStore>((set, get) => ({
  busy: false,
  health: {},
  problem: null,
  state: NO_CONNECTIONS,
  zones: [],
  zonesFor: null,

  async read() {
    set({ state: await window.pupitre.connectionsState() });
  },

  async connect(kind, token) {
    set({ busy: true, problem: null });

    const answer = await window.pupitre.connectAccount(kind, token);

    if (!answer.ok) {
      set({ busy: false, problem: answer.error });

      return false;
    }

    set({ busy: false, problem: null, state: answer.result, zonesFor: null });
    await get().loadZones();

    return true;
  },

  async forget(kind) {
    set({ busy: true, problem: null });

    const state = await window.pupitre.forgetAccount(kind);

    set((held) => {
      const { [kind]: _gone, ...health } = held.health;

      return { busy: false, health, state, zones: [], zonesFor: null };
    });
  },

  async verify(kind) {
    set((held) => ({
      health: { ...held.health, [kind]: { status: "checking" } },
    }));

    const answer = await window.pupitre.verifyAccount(kind);

    if (!answer.ok) {
      set((held) => ({
        health: {
          ...held.health,
          [kind]: { error: answer.error, status: "refused" },
        },
      }));

      return;
    }

    if (answer.result.status === "unaskable") {
      set((held) => ({
        health: { ...held.health, [kind]: { status: "unaskable" } },
      }));

      return;
    }

    const account = answer.result.account;

    set((held) => {
      const current = held.state[kind];

      return {
        health: {
          ...held.health,
          [kind]: { account: account.name, at: Date.now(), status: "answered" },
        },
        state: {
          ...held.state,
          [kind]:
            current.status === "connected" ? { ...current, account } : current,
        },
      };
    });
  },

  /**
   * The zones of the connected account, read when the screen opens rather than
   * remembered: a zone added on Cloudflare this morning is one the form offers
   * this afternoon.
   */
  async loadZones() {
    const held = get().state.cloudflare;
    const account = held.status === "connected" ? held.account : null;

    if (!account || get().zonesFor === account.id) {
      return;
    }

    const answer = await window.pupitre.connectionZones();

    if (answer.ok) {
      set({ zones: answer.result, zonesFor: account.id });
    }
  },

  holds(kind) {
    return get().state[kind as ConnectionKind]?.status === "connected";
  },
}));
