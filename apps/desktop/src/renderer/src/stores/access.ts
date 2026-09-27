import type {
  AccessKey,
  AccessListResult,
} from "@pupitre/shared/agent-protocol/access";
import { agentCall as call } from "@renderer/lib/agent-call";
import type { AccessCopyForm, AccessHeld } from "@shared/access";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

export type AccessState =
  | { status: "idle" }
  | { status: "loading"; serverId: string }
  | { status: "read"; serverId: string; keys: AccessKey[]; held: AccessHeld }
  | { status: "failed"; serverId: string; error: AgentError };

/** The last gesture's outcome, shown where it was made. */
export type AccessGesture =
  | { status: "idle" }
  | { status: "copied"; id: string; form: AccessCopyForm }
  | { status: "failed"; id: string | null; error: AgentError };

const NOTHING_HELD: AccessHeld = { device: null, held: [] };

interface AccessStore {
  state: AccessState;
  gesture: AccessGesture;
  revoking: string | null;

  read: (serverId: string) => Promise<void>;
  /** The created key, or null when the server refused it; the refusal is in `gesture`. */
  create: (
    serverId: string,
    name: string,
    projects: string[] | null
  ) => Promise<AccessKey | null>;
  rescope: (
    serverId: string,
    id: string,
    projects: string[] | null
  ) => Promise<void>;
  revoke: (serverId: string, id: string) => Promise<void>;
  copy: (
    serverId: string,
    id: string,
    form: AccessCopyForm,
    hostname: string | null
  ) => Promise<void>;
  settle: () => void;
  forget: () => void;
}

export function opens(key: AccessKey, project: string): boolean {
  return key.projects === null || key.projects.includes(project);
}

export const useAccess = create<AccessStore>((set, get) => {
  function failed(id: string | null, error: AgentError): void {
    set({ gesture: { error, id, status: "failed" } });
  }

  return {
    gesture: { status: "idle" },
    revoking: null,
    state: { status: "idle" },

    async read(serverId) {
      const current = get().state;

      if (!("serverId" in current && current.serverId === serverId)) {
        set({ state: { serverId, status: "loading" } });
      }

      const answer = await call<AccessListResult>(serverId, "access.list");

      if (!answer.ok) {
        set({ state: { error: answer.error, serverId, status: "failed" } });

        return;
      }

      const held = await window.pupitre.heldAccessKeys(
        serverId,
        answer.result.keys.map((key) => key.id)
      );

      set({
        state: {
          held: held.ok ? held.result : NOTHING_HELD,
          keys: answer.result.keys,
          serverId,
          status: "read",
        },
      });
    },

    async create(serverId, name, projects) {
      set({ gesture: { status: "idle" } });

      const answer = await window.pupitre.createAccessKey(
        serverId,
        name,
        projects
      );

      if (!answer.ok) {
        failed(null, answer.error);

        return null;
      }

      await get().read(serverId);

      return answer.result;
    },

    async rescope(serverId, id, projects) {
      const answer = await call<AccessKey>(serverId, "access.update", {
        id,
        projects,
      });

      if (!answer.ok) {
        failed(id, answer.error);

        return;
      }

      await get().read(serverId);
    },

    async revoke(serverId, id) {
      set({ gesture: { status: "idle" }, revoking: id });

      const answer = await window.pupitre.revokeAccessKey(serverId, id);

      set({ revoking: null });

      if (!answer.ok) {
        failed(id, answer.error);

        return;
      }

      await get().read(serverId);
    },

    async copy(serverId, id, form, hostname) {
      const answer = await window.pupitre.copyAccessKey(
        serverId,
        id,
        form,
        hostname
      );

      set({
        gesture: answer.ok
          ? { form, id, status: "copied" }
          : { error: answer.error, id, status: "failed" },
      });
    },

    settle() {
      set({ gesture: { status: "idle" } });
    },

    forget() {
      set({
        gesture: { status: "idle" },
        revoking: null,
        state: { status: "idle" },
      });
    },
  };
});
