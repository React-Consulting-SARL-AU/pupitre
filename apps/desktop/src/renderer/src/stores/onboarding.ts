import type { AgentError } from "@shared/agent";
import type { AgentDelivery } from "@shared/install";
import { create } from "zustand";
import { carriesSecret } from "../lib/catalog-selection";
import { useCatalog } from "./catalog";

/**
 * The order of the onboarding, and where it got to.
 *
 * The binary comes before the catalogue and not with the install: a bare
 * machine has nothing to answer `catalog` with until `pupitred` sits on it.
 * Going back is allowed as long as nothing has been installed — after that the
 * machine has changed, and a screen that let you "go back" would be lying.
 */

export const ONBOARDING_STEPS = [
  "server",
  "inspection",
  "agent",
  "catalog",
  "config",
  "install",
  "harden",
  "project",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** `closed` is the app as it stands: the onboarding is a screen, not a mode. */
export type OnboardingView = OnboardingStep | "closed";

export type DeliveryState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; delivery: AgentDelivery }
  | { status: "failed"; error: AgentError };

interface Saved {
  serverId: string | null;
  step: OnboardingStep;
  installed: boolean;
}

const KEY = "pupitre.onboarding";

const held = new Map<string, string>();

const memory = {
  getItem: (key: string): string | null => held.get(key) ?? null,
  removeItem: (key: string): void => {
    held.delete(key);
  },
  setItem: (key: string, value: string): void => {
    held.set(key, value);
  },
};

/**
 * Where the progress is written down, so a relaunched app opens on the screen
 * the reader left. `localStorage` is the renderer's own; a build that has none
 * — a test, a headless render — falls back to memory rather than throwing.
 */
function shelf(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  try {
    return globalThis.localStorage ?? memory;
  } catch {
    return memory;
  }
}

function keep(saved: Saved | null): void {
  try {
    if (saved) {
      shelf().setItem(KEY, JSON.stringify(saved));
    } else {
      shelf().removeItem(KEY);
    }
  } catch {
    // A full or refused storage costs the resume, not the onboarding.
  }
}

export function savedOnboarding(): Saved | null {
  try {
    const raw = shelf().getItem(KEY);
    const saved = raw ? (JSON.parse(raw) as Saved) : null;

    return saved && ONBOARDING_STEPS.includes(saved.step) ? saved : null;
  } catch {
    return null;
  }
}

export function forgetOnboarding(): void {
  keep(null);
}

interface OnboardingStore {
  step: OnboardingView;
  serverId: string | null;
  installed: boolean;
  /** The module whose configuration is being asked again before a replay. */
  replaying: string | null;
  delivery: DeliveryState;

  open: () => void;
  begin: (serverId: string) => void;
  goTo: (step: OnboardingStep) => void;
  back: () => void;
  canGoBack: () => boolean;
  noteInstalled: () => void;
  replay: (moduleId: string) => OnboardingStep;
  endReplay: () => void;
  sendAgent: () => Promise<void>;
  close: () => void;
  resume: () => void;
  reset: () => void;
}

function rank(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

export const useOnboarding = create<OnboardingStore>((set, get) => {
  function move(step: OnboardingStep): void {
    const { serverId, installed } = get();

    set({ step });
    keep({ installed, serverId, step });
  }

  return {
    delivery: { status: "idle" },
    installed: false,
    replaying: null,
    serverId: null,
    step: "closed",

    open() {
      set({
        delivery: { status: "idle" },
        installed: false,
        replaying: null,
        serverId: null,
      });
      move("server");
    },

    begin(serverId) {
      set({
        delivery: { status: "idle" },
        installed: false,
        replaying: null,
        serverId,
      });
      move("inspection");
    },

    goTo(step) {
      move(step);
    },

    canGoBack() {
      const { step, installed } = get();

      return (
        !installed && step !== "closed" && step !== "server" && step !== "done"
      );
    },

    back() {
      const { step } = get();

      if (!(get().canGoBack() && step !== "closed")) {
        return;
      }

      const previous = ONBOARDING_STEPS[rank(step) - 1];

      if (previous) {
        move(previous);
      }
    },

    /** From here the machine has changed: the way back is the way through. */
    noteInstalled() {
      const { serverId, step } = get();

      set({ installed: true });
      keep({
        installed: true,
        serverId,
        step: step === "closed" ? "install" : step,
      });
    },

    /**
     * The vault was emptied when the secrets left, so a module that carried one
     * cannot simply be run again: its configuration is asked a second time, and
     * the screen says why.
     */
    replay(moduleId) {
      const manifest = useCatalog
        .getState()
        .modules()
        .find((candidate) => candidate.id === moduleId);

      if (!(manifest && carriesSecret(manifest))) {
        return "install";
      }

      set({ replaying: moduleId });
      move("config");

      return "config";
    },

    endReplay() {
      set({ replaying: null });
      move("install");
    },

    async sendAgent() {
      const { serverId } = get();

      if (!serverId) {
        return;
      }

      set({ delivery: { status: "sending" } });

      const answer = await window.pupitre.sendAgent(serverId);

      set({
        delivery: answer.ok
          ? { delivery: answer.result, status: "sent" }
          : { error: answer.error, status: "failed" },
      });
    },

    /** Leaving the wizard keeps the progress: the servers screen offers it back. */
    close() {
      set({ step: "closed" });
    },

    resume() {
      const saved = savedOnboarding();

      if (!saved || saved.step === "done") {
        return;
      }

      set({
        installed: saved.installed,
        replaying: null,
        serverId: saved.serverId,
        step: saved.step,
      });
    },

    reset() {
      keep(null);
      set({
        delivery: { status: "idle" },
        installed: false,
        replaying: null,
        serverId: null,
        step: "closed",
      });
    },
  };
});
