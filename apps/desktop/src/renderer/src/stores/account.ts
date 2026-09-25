import type {
  AccountDevice,
  AccountError,
  AccountState,
} from "@shared/account";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

export type AccountView =
  | { status: "unknown" }
  | { status: "read"; account: AccountState }
  | { status: "failed"; error: AgentError };

export type SignInState =
  | { status: "idle" }
  | { status: "starting" }
  | { status: "code"; userCode: string; verificationUri: string }
  | { status: "waiting"; userCode: string; verificationUri: string }
  | { status: "failed"; error: AccountError };

export type DevicesState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; devices: AccountDevice[] }
  | { status: "failed"; error: AgentError };

interface AccountStore {
  view: AccountView;
  signIn: SignInState;
  devices: DevicesState;
  revoking: string | null;
  deviceProblem: AgentError | null;
  // Never persisted: the app must open on the sign-in at every launch.
  bypassed: boolean;

  read: () => Promise<void>;
  refresh: () => Promise<void>;
  switchOrganization: (organizationId: string) => Promise<void>;
  connect: () => Promise<void>;
  cancelSignIn: () => void;
  disconnect: () => Promise<void>;
  readDevices: () => Promise<void>;
  revokeDevice: (deviceId: string) => Promise<void>;
  bypass: () => void;
  forgetSignIn: () => void;
}

export function accountOf(view: AccountView): AccountState | null {
  return view.status === "read" ? view.account : null;
}

function unread(reason: unknown): AgentError {
  return {
    code: "internal",
    message: reason instanceof Error ? reason.message : String(reason),
    phrase: { id: "account.read.failed" },
  };
}

// Bumped on every start and cancel so a stale sign-in answer lands nowhere.
let signInAttempt = 0;

export const useAccount = create<AccountStore>((set, get) => ({
  bypassed: false,
  deviceProblem: null,
  devices: { status: "idle" },
  revoking: null,
  signIn: { status: "idle" },
  view: { status: "unknown" },

  async read() {
    try {
      set({
        view: { account: await window.pupitre.account(), status: "read" },
      });
    } catch (reason) {
      set({ view: { error: unread(reason), status: "failed" } });
    }
  },

  async switchOrganization(organizationId) {
    set({
      view: {
        account: await window.pupitre.switchOrganization(organizationId),
        status: "read",
      },
    });
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

    signInAttempt += 1;

    const own = signInAttempt;

    set({ signIn: { status: "starting" } });

    const answer = await window.pupitre.signIn((progress) => {
      if (own !== signInAttempt) {
        return;
      }

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

    if (own !== signInAttempt) {
      return;
    }

    set(
      answer.ok
        ? {
            signIn: { status: "idle" },
            view: { account: answer.result, status: "read" },
          }
        : { signIn: { error: answer.error, status: "failed" } }
    );
  },

  cancelSignIn() {
    signInAttempt += 1;
    window.pupitre.cancelSignIn();
    set({ signIn: { status: "idle" } });
  },

  async disconnect() {
    set({
      bypassed: false,
      deviceProblem: null,
      devices: { status: "idle" },
      signIn: { status: "idle" },
      view: { account: await window.pupitre.signOut(), status: "read" },
    });
  },

  async readDevices() {
    if (get().devices.status === "idle") {
      set({ devices: { status: "reading" } });
    }

    const answer = await window.pupitre.accountDevices();

    set({
      devices: answer.ok
        ? { devices: answer.result, status: "read" }
        : { error: answer.error, status: "failed" },
    });
  },

  async revokeDevice(deviceId) {
    set({ deviceProblem: null, revoking: deviceId });

    const answer = await window.pupitre.revokeDevice(deviceId);

    set({ deviceProblem: answer.ok ? null : answer.error, revoking: null });

    if (answer.ok) {
      await get().readDevices();
    }
  },

  bypass() {
    set({ bypassed: true });
  },

  forgetSignIn() {
    set({ signIn: { status: "idle" } });
  },
}));
