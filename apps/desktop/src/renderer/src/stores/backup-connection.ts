import type { AgentError } from "@shared/agent";
import type {
  BackupConnectionInput,
  BackupConnectionView,
  OrganizationIdentity,
} from "@shared/backups";
import { create } from "zustand";
import { bridged } from "../lib/bridged";
import { useConnections } from "./connections";

/**
 * The bucket backups go to, as this computer holds it.
 *
 * Nothing secret is here: the settings of the bucket and the public key are
 * not secrets, the secret access key never comes back from the keychain, and
 * the passphrase is sent once and forgotten on the way. What the store also
 * knows is whether the organization already has an identity to adopt — a
 * second computer takes it rather than asking for the passphrase.
 */

export type HeldState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; view: BackupConnectionView | null };

export type IdentityState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; identity: OrganizationIdentity | null }
  | { status: "failed"; error: AgentError };

interface BackupConnectionStore {
  held: HeldState;
  identity: IdentityState;
  saving: boolean;
  probing: boolean;
  problem: AgentError | null;

  read: () => Promise<void>;
  /** True once the bucket took a test write; false on a refusal, which the form shows. */
  probe: (input: BackupConnectionInput) => Promise<boolean>;
  /** True once the connection is kept; false on a refusal, which the form shows. */
  save: (input: BackupConnectionInput) => Promise<boolean>;
  forget: () => Promise<void>;
  /** The refusal belongs to the step that got it: moving on leaves it behind. */
  dismiss: () => void;
}

export const useBackupConnection = create<BackupConnectionStore>((set) => ({
  held: { status: "idle" },
  identity: { status: "idle" },
  probing: false,
  problem: null,
  saving: false,

  async read() {
    set((state) => ({
      held: state.held.status === "read" ? state.held : { status: "reading" },
      identity:
        state.identity.status === "read"
          ? state.identity
          : { status: "reading" },
    }));

    const [view, identity] = await Promise.all([
      window.pupitre.backupConnection(),
      window.pupitre.backupIdentity(),
    ]);

    set({
      held: { status: "read", view },
      identity: identity.ok
        ? { identity: identity.result, status: "read" }
        : { error: identity.error, status: "failed" },
    });
  },

  async probe(input) {
    set({ probing: true, problem: null });

    const answer = await bridged("backup:probe", () =>
      window.pupitre.probeBackup(input)
    );

    set({ probing: false, problem: answer.ok ? null : answer.error });

    return answer.ok;
  },

  async save(input) {
    set({ problem: null, saving: true });

    const answer = await bridged("backup:connect", () =>
      window.pupitre.connectBackup(input)
    );

    if (!answer.ok) {
      set({ problem: answer.error, saving: false });

      return false;
    }

    set({ held: { status: "read", view: answer.result }, saving: false });
    await useConnections.getState().read();

    return true;
  },

  async forget() {
    await useConnections.getState().forget("backup");

    set({ held: { status: "read", view: null }, problem: null });
  },

  dismiss() {
    set({ problem: null });
  },
}));
