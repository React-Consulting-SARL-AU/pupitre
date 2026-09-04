import type { AgentError } from "@shared/agent";
import type { Server, ServersConfig } from "@shared/contract";
import type { HostKeyAction, ServerAdded, ServerDraft } from "@shared/servers";
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

export type HostKeyState =
  | { status: "unknown" }
  | {
      status: "changed";
      serverId: string;
      expected: string;
      observed: string | null;
      message: string;
      fix: string;
      actions: HostKeyAction[];
    };

type ServersStore = {
  status: "idle" | "loading" | "ready";
  config: ServersConfig | null;
  addition: Addition;
  /** The public half of the last key made, kept only while the screen shows it. */
  publicKey: string | null;
  hostKey: HostKeyState;

  load: () => Promise<void>;
  add: (draft: ServerDraft) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  activate: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  forgetAddition: () => void;

  checkHostKey: (id: string) => Promise<void>;
  trustReinstalled: (id: string) => Promise<void>;
  dismissHostKey: () => void;
};

function added(result: ServerAdded): Addition {
  return {
    copyId: result.copyId,
    publicKey: result.publicKey,
    server: result.server,
    status: "added",
  };
}

export const useServers = create<ServersStore>((set, get) => ({
  addition: { status: "idle" },
  config: null,
  hostKey: { status: "unknown" },
  publicKey: null,
  status: "idle",

  async load() {
    set({ status: "loading" });
    set({ config: await window.pupitre.servers(), status: "ready" });
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
    set({ config: await window.pupitre.removeServer(id) });
  },

  forgetAddition() {
    set({ addition: { status: "idle" }, publicKey: null });
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
