import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentError } from "@shared/agent";
import type { CloudflareZone } from "@shared/cloudflare";
import type {
  ConnectionAccount,
  ConnectionKind,
  ConnectionsState,
} from "@shared/connections";
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
  /** The account whose token is being sent or taken back, so the other cards stay quiet. */
  busy: ConnectionKind | null;
  problems: Partial<Record<ConnectionKind, AgentError>>;
  /** The accounts a token opened when it opened several: the card asks which one before anything is kept. */
  choices: Partial<Record<ConnectionKind, ConnectionAccount[]>>;
  zones: readonly CloudflareZone[];
  zonesFor: string | null;
  health: Partial<Record<ConnectionKind, ConnectionHealth>>;

  read: () => Promise<void>;
  /** True once the account is kept; false on a refusal, or while a choice is still owed. */
  connect: (
    kind: ConnectionKind,
    token: string,
    accountId?: string
  ) => Promise<boolean>;
  /** A token retyped makes the accounts the previous one opened moot. */
  dropChoice: (kind: ConnectionKind) => void;
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

function without<T>(
  record: Partial<Record<ConnectionKind, T>>,
  kind: ConnectionKind
): Partial<Record<ConnectionKind, T>> {
  const { [kind]: _gone, ...rest } = record;

  return rest;
}

export const useConnections = create<ConnectionStore>((set, get) => ({
  busy: null,
  choices: {},
  health: {},
  problems: {},
  state: NO_CONNECTIONS,
  zones: [],
  zonesFor: null,

  async read() {
    set({ state: await window.pupitre.connectionsState() });
  },

  async connect(kind, token, accountId) {
    set((held) => ({ busy: kind, problems: without(held.problems, kind) }));

    const answer = await window.pupitre.connectAccount(kind, token, accountId);

    if (!answer.ok) {
      set((held) => ({
        busy: null,
        problems: { ...held.problems, [kind]: answer.error },
      }));

      return false;
    }

    const outcome = answer.result;

    if (outcome.status === "choose") {
      set((held) => ({
        busy: null,
        choices: { ...held.choices, [kind]: outcome.accounts },
      }));

      return false;
    }

    set((held) => ({
      busy: null,
      choices: without(held.choices, kind),
      state: outcome.state,
      zonesFor: null,
    }));
    await get().loadZones();

    return true;
  },

  dropChoice(kind) {
    set((held) => ({ choices: without(held.choices, kind) }));
  },

  async forget(kind) {
    set((held) => ({ busy: kind, problems: without(held.problems, kind) }));

    const state = await window.pupitre.forgetAccount(kind);

    set((held) => ({
      busy: null,
      health: without(held.health, kind),
      state,
      zones: [],
      zonesFor: null,
    }));
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
