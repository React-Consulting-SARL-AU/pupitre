import type {
  AccountDevice,
  AccountError,
  AccountState,
} from "@shared/account";
import type { AgentError } from "@shared/agent";
import { create } from "zustand";

/**
 * The account, as the screens read it.
 *
 * The store holds what the main process handed over and nothing else: no token,
 * no enrolment secret. The sign-in is a state of its own, because the code on
 * screen has to stay readable for as long as the browser takes. A bridge that
 * does not answer is a state too: the app cannot judge a right it could not
 * read, and says so rather than waiting for an answer that is not coming.
 */

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

/** The devices the platform holds for this account, as last read. */
export type DevicesState =
  | { status: "idle" }
  | { status: "reading" }
  | { status: "read"; devices: AccountDevice[] }
  | { status: "failed"; error: AgentError };

interface AccountStore {
  view: AccountView;
  signIn: SignInState;
  devices: DevicesState;
  /** The device a revocation is under way on, so its own button waits. */
  revoking: string | null;
  /** What the platform refused when a device was revoked, until the next try. */
  deviceProblem: AgentError | null;
  /**
   * Whether a development build was told to work without an account. It lives
   * for this run only: the app is meant to open on the sign-in, and a choice
   * written down would quietly undo that on the next launch.
   */
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

/** What the bridge threw, kept as it came, under the app's own sentence. */
function unread(reason: unknown): AgentError {
  return {
    code: "internal",
    message: reason instanceof Error ? reason.message : String(reason),
    phrase: { id: "account.read.failed" },
  };
}

/** A sign-in answered after it was cancelled, or after a newer one began, lands nowhere. */
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

  /** The list is read again after: what the platform holds is the truth, not what was clicked. */
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
