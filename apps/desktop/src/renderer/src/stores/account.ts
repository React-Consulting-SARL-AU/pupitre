import type { AccountError, AccountState } from "@shared/account";
import { create } from "zustand";

/**
 * The account, as the screens read it.
 *
 * The store holds what the main process handed over and nothing else: no token,
 * no enrolment secret. The sign-in is a state of its own, because the code on
 * screen has to stay readable for as long as the browser takes.
 */

export type AccountView =
  | { status: "unknown" }
  | { status: "read"; account: AccountState };

export type SignInState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "code"; userCode: string; verificationUri: string }
  | { status: "waiting"; userCode: string; verificationUri: string }
  | { status: "failed"; error: AccountError };

interface AccountStore {
  view: AccountView;
  signIn: SignInState;

  read: () => Promise<void>;
  refresh: () => Promise<void>;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  forgetSignIn: () => void;
}

export function accountOf(view: AccountView): AccountState | null {
  return view.status === "read" ? view.account : null;
}

export const useAccount = create<AccountStore>((set, get) => ({
  signIn: { status: "idle" },
  view: { status: "unknown" },

  async read() {
    set({ view: { account: await window.pupitre.account(), status: "read" } });
  },

  async refresh() {
    set({
      view: { account: await window.pupitre.refreshAccount(), status: "read" },
    });
  },

  async connect() {
    if (get().signIn.status !== "idle" && get().signIn.status !== "failed") {
      return;
    }

    set({ signIn: { status: "starting" } });

    const answer = await window.pupitre.signIn((progress) => {
      const held = get().signIn;

      if (progress.kind === "code") {
        set({
          signIn: {
            status: "code",
            userCode: progress.userCode,
            verificationUri: progress.verificationUriComplete,
          },
        });
      }

      if (progress.kind === "waiting" && held.status === "code") {
        set({ signIn: { ...held, status: "waiting" } });
      }
    });

    set(
      answer.ok
        ? {
            signIn: { status: "idle" },
            view: { account: answer.result, status: "read" },
          }
        : { signIn: { error: answer.error, status: "failed" } }
    );
  },

  async disconnect() {
    set({
      signIn: { status: "idle" },
      view: { account: await window.pupitre.signOut(), status: "read" },
    });
  },

  forgetSignIn() {
    set({ signIn: { status: "idle" } });
  },
}));
