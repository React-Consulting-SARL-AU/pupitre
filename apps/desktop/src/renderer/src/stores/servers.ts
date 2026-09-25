import type { AgentError, ErrorPhrase } from "@shared/agent";
import type {
  HostKeyAction,
  KeyInstallPhase,
  Server,
  ServerAdded,
  ServerChanges,
  ServerDraft,
  ServersConfig,
} from "@shared/servers";
import { create } from "zustand";

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

/** Never holds the password: it crosses the bridge once and is kept nowhere. */
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

export type EditState =
  | { status: "idle" }
  | { status: "working"; serverId: string }
  | { status: "refused"; serverId: string; error: AgentError }
  | { status: "done"; serverId: string; hostKeyDropped: boolean };

export type RemovalState =
  | { status: "idle" }
  | { status: "working"; serverId: string }
  | { status: "refused"; serverId: string; error: AgentError };

interface ServersStore {
  status: "idle" | "loading" | "ready";
  config: ServersConfig | null;
  addition: Addition;
  removal: RemovalState;
  edit: EditState;
  publicKey: string | null;
  hostKey: HostKeyState;
  keyInstall: KeyInstallState;

  load: () => Promise<void>;
  add: (draft: ServerDraft) => Promise<void>;
  installKey: (id: string, password: string | null) => Promise<void>;
  forgetKeyInstall: () => void;
  rename: (id: string, name: string) => Promise<void>;
  update: (id: string, changes: ServerChanges) => Promise<void>;
  forgetEdit: () => void;
  activate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Unlike `remove`, also erases the server from the platform. */
  forget: (id: string) => Promise<void>;
  forgetAddition: () => void;
  forgetRemoval: () => void;

  checkHostKey: (id: string) => Promise<void>;
  trustReinstalled: (id: string) => Promise<void>;
  dismissHostKey: () => void;
}

const NO_SERVERS: readonly Server[] = [];

/** Returns the same empty list until the main process answers, so selectors keep a stable reference. */
export function serversIn(config: ServersConfig | null): readonly Server[] {
  return config?.servers ?? NO_SERVERS;
}

function added(result: ServerAdded): Addition {
  return {
    copyId: result.copyId,
    publicKey: result.publicKey,
    server: result.server,
    status: "added",
  };
}

// Bumped to orphan a pending key install: a removed server's `ssh` runs on until it times out.
let knock = 0;

// Drops the key install of a removed server, else the screen asks for a password the main process must refuse.
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
  edit: { status: "idle" },
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
      keyInstall: answer.result.keyInstall ?? { status: "idle" },
      publicKey: answer.result.publicKey,
      status: "ready",
    });
  },

  async rename(id, name) {
    set({ config: await window.pupitre.renameServer(id, name) });
  },

  async update(id, changes) {
    set({ edit: { serverId: id, status: "working" } });

    const answer = await window.pupitre.updateServer(id, changes);

    set(
      answer.ok
        ? {
            config: answer.result.config,
            edit: {
              hostKeyDropped: answer.result.hostKeyDropped,
              serverId: id,
              status: "done",
            },
            hostKey: { status: "unknown" },
          }
        : { edit: { error: answer.error, serverId: id, status: "refused" } }
    );
  },

  forgetEdit() {
    set({ edit: { status: "idle" } });
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

  // The main process pins a first contact silently: only a changed key reaches the screen.
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

  // Dismissing changes nothing on disk: the old fingerprint stays pinned.
  dismissHostKey() {
    set({ hostKey: { status: "unknown" } });
  },
}));
