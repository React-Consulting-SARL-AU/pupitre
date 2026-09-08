import type { AgentError, ErrorPhrase } from "@shared/agent";
import type {
  HostKeyAction,
  KeyInstallPhase,
  Server,
  ServerAdded,
  ServerDraft,
  ServersConfig,
} from "@shared/servers";
import { create } from "zustand";

/**
 * The servers, as the screen needs them.
 *
 * The store holds no secret and computes nothing: the main process owns the
 * files, the keys and the fingerprints, and answers with the configuration it
 * has just written. What lives here is the shape of the screen — which server
 * is being added, which public key to show, and whether a host key stands in
 * the way.
 */

export type Addition =
  | { status: "idle" }
  | { status: "adding" }
  | {
      status: "added";
      server: Server;
      publicKey: string | null;
      copyId: string | null;
    }
  | { status: "failed"; error: AgentError };

/**
 * Where the app stands while it installs its key on the server.
 *
 * The password is not here: it is typed into the screen, crosses the bridge
 * once and is kept nowhere. The store holds the current step and what the
 * machine answered.
 */
export type KeyInstallState =
  | { status: "idle" }
  | { status: "working"; phase: KeyInstallPhase }
  | { status: "opened"; installed: boolean }
  | { status: "password"; retry: boolean }
  | { status: "manual"; phrase: ErrorPhrase }
  | { status: "failed"; error: AgentError };

export type HostKeyState =
  | { status: "unknown" }
  | {
      status: "changed";
      serverId: string;
      expected: string;
      observed: string | null;
      phrase: ErrorPhrase;
      actions: HostKeyAction[];
    };

/** What the platform answered to the last "remove everywhere". */
export type RemovalState =
  | { status: "idle" }
  | { status: "working"; serverId: string }
  | { status: "refused"; serverId: string; error: AgentError };

interface ServersStore {
  status: "idle" | "loading" | "ready";
  config: ServersConfig | null;
  addition: Addition;
  removal: RemovalState;
  /** The public half of the last key made, kept only while the screen shows it. */
  publicKey: string | null;
  hostKey: HostKeyState;
  keyInstall: KeyInstallState;

  load: () => Promise<void>;
  add: (draft: ServerDraft) => Promise<void>;
  installKey: (id: string, password: string | null) => Promise<void>;
  forgetKeyInstall: () => void;
  rename: (id: string, name: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Removes the server from here and erases it from the platform, in one move. */
  forget: (id: string) => Promise<void>;
  forgetAddition: () => void;
  forgetRemoval: () => void;

  checkHostKey: (id: string) => Promise<void>;
  trustReinstalled: (id: string) => Promise<void>;
  dismissHostKey: () => void;
}

function added(result: ServerAdded): Addition {
  return {
    copyId: result.copyId,
    publicKey: result.publicKey,
    server: result.server,
    status: "added",
  };
}

/**
 * The knock the screen is waiting on. A removed server leaves its `ssh` running
 * for as long as it takes to time out, and that answer belongs to nobody.
 */
let knock = 0;

/**
 * A server that has left the list takes its key installation with it.
 *
 * Deleting a machine while its key is being installed left the screen asking
 * for the password of a server the app no longer knows, and the main process
 * could only refuse it.
 */
function settled(
  state: ServersStore,
  config: ServersConfig
): Partial<ServersStore> {
  const id =
    state.addition.status === "added" ? state.addition.server.id : null;

  if (id && !config.servers.some((server) => server.id === id)) {
    knock += 1;

    return {
      addition: { status: "idle" },
      config,
      keyInstall: { status: "idle" },
      publicKey: null,
    };
  }

  return { config };
}

export const useServers = create<ServersStore>((set, get) => ({
  addition: { status: "idle" },
  config: null,
  hostKey: { status: "unknown" },
  keyInstall: { status: "idle" },
  publicKey: null,
  removal: { status: "idle" },
  status: "idle",

  async load() {
    set({ status: "loading" });

    const config = await window.pupitre.servers();

    set({ ...settled(get(), config), status: "ready" });
  },

  async add(draft) {
    set({ addition: { status: "adding" } });

    const answer = await window.pupitre.addServer(draft);

    if (!answer.ok) {
      set({ addition: { error: answer.error, status: "failed" } });
      return;
    }

    set({
      addition: added(answer.result),
      config: answer.result.config,
      keyInstall: { status: "idle" },
      publicKey: answer.result.publicKey,
      status: "ready",
    });
  },

  async rename(id, name) {
    set({ config: await window.pupitre.renameServer(id, name) });
  },

  async activate(id) {
    set({ config: await window.pupitre.activateServer(id) });
  },

  async remove(id) {
    const config = await window.pupitre.removeServer(id);

    set(settled(get(), config));
  },

  async forget(id) {
    set({ removal: { serverId: id, status: "working" } });

    const answer = await window.pupitre.forgetServer(id);

    set(
      answer.ok
        ? { ...settled(get(), answer.result), removal: { status: "idle" } }
        : { removal: { error: answer.error, serverId: id, status: "refused" } }
    );
  },

  forgetRemoval() {
    set({ removal: { status: "idle" } });
  },

  /**
   * The app installs the key itself, and hands over only when it cannot.
   *
   * The password is passed as an argument and never enters the state: the store
   * keeps the fact that a password was refused, not which one.
   */
  async installKey(id, password) {
    const mine = ++knock;

    set({ keyInstall: { phase: "reaching", status: "working" } });

    const answer = await window.pupitre.installKey(id, password, (phase) =>
      set((state) =>
        mine === knock && state.keyInstall.status === "working"
          ? { keyInstall: { phase, status: "working" } }
          : state
      )
    );

    if (mine !== knock) {
      return;
    }

    if (!answer.ok) {
      set({ keyInstall: { error: answer.error, status: "failed" } });
      return;
    }

    set({ keyInstall: answer.result });
  },

  forgetKeyInstall() {
    set({ keyInstall: { status: "idle" } });
  },

  forgetAddition() {
    set({
      addition: { status: "idle" },
      keyInstall: { status: "idle" },
      publicKey: null,
    });
  },

  /**
   * A first contact is not worth remembering: the main process has just pinned
   * whatever answered, and there is nothing for the screen to say about it.
   */
  async checkHostKey(id) {
    const answer = await window.pupitre.hostKey(id);

    if (!answer.ok || answer.result.status !== "changed") {
      set({ hostKey: { status: "unknown" } });
      return;
    }

    set({ hostKey: { ...answer.result, serverId: id } });
  },

  async trustReinstalled(id) {
    const answer = await window.pupitre.trustReinstalled(id);

    set({
      config: answer.ok ? answer.result : get().config,
      hostKey: { status: "unknown" },
    });
  },

  /** Cancelling changes nothing on disk: the fingerprint stays pinned. */
  dismissHostKey() {
    set({ hostKey: { status: "unknown" } });
  },
}));
