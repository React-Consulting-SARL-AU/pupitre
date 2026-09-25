import type { Manifest } from "@pupitre/shared/catalog";
import type { AgentError } from "@shared/agent";
import type { RestoredSetup } from "@shared/backups";
import type { AgentDelivery, AgentSendPhase } from "@shared/install";
import { create } from "zustand";
import { translate } from "../i18n/translate";
import { carriesSecret, restored } from "../lib/catalog-selection";
import { accountOf, useAccount } from "./account";
import { announce } from "./announcements";
import { useCatalog } from "./catalog";
import { useFleet } from "./fleet";
import { useHarden } from "./harden";
import { probeOf, useInspection } from "./inspection";
import { useInstall } from "./install";
import {
  canGoBack as allowedBack,
  CLOSED,
  type Effect,
  type Event,
  type MachineState,
  ONBOARDING_STEPS,
  type OnboardingStep,
  transition,
} from "./onboarding-machine";
import { useRestore } from "./restore";
import { useServers } from "./servers";

export type DeliveryState =
  | { status: "idle" }
  | { status: "sending"; phase: AgentSendPhase }
  | { status: "sent"; delivery: AgentDelivery }
  | { status: "failed"; error: AgentError };

interface Saved {
  serverId: string | null;
  step: OnboardingStep;
  installed: boolean;
  /** Never holds a secret: secrets do not reach this side of the bridge. */
  selected: readonly string[];
  values: Record<string, Record<string, unknown>>;
  restored: RestoredSetup | null;
}

const KEY = "pupitre.onboarding";

const DRAFT_PAUSE_MS = 400;

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

// Outside a window (a test, a headless render) effects find no bridge and answer nothing instead of throwing.
function bridge(): Partial<Window["pupitre"]> {
  return globalThis.window?.pupitre ?? {};
}

// Falls back to memory where localStorage is missing or throws (a test, a headless render).
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
    const saved = raw ? (JSON.parse(raw) as Partial<Saved>) : null;

    if (!(saved?.step && ONBOARDING_STEPS.includes(saved.step))) {
      return null;
    }

    return {
      installed: saved.installed === true,
      restored: saved.restored ?? null,
      selected: Array.isArray(saved.selected) ? saved.selected : [],
      serverId: saved.serverId ?? null,
      step: saved.step,
      values: saved.values ?? {},
    };
  } catch {
    return null;
  }
}

export function forgetOnboarding(): void {
  keep(null);
}

interface OnboardingStore extends MachineState {
  /** True while a relaunch reads the machine again, before any screen acts. */
  recovering: boolean;
  delivery: DeliveryState;

  send: (event: Event) => void;
  noteDraft: () => void;
  open: () => void;
  begin: (serverId: string) => void;
  secure: (serverId: string) => void;
  back: () => void;
  canGoBack: () => boolean;
  replay: (moduleId: string) => OnboardingStep;
  sendAgent: () => Promise<void>;
  restoreFrom: (backupId: string, passphrase: string) => Promise<void>;
  bringData: (
    parts: readonly string[],
    passphrase: string | null
  ) => Promise<void>;
  skipData: () => Promise<void>;
  close: () => void;
  resume: () => Promise<void>;
  reset: () => void;
}

function manifestOf(moduleId: string): Manifest | undefined {
  return useCatalog
    .getState()
    .modules()
    .find((candidate) => candidate.id === moduleId);
}

type Draft = Pick<Saved, "selected" | "values">;

function shelved(): Draft {
  const saved = savedOnboarding();

  return { selected: saved?.selected ?? [], values: saved?.values ?? {} };
}

// Other screens share the catalogue store: a catalogue read for another server must not erase the shelved draft.
function ownDraft(serverId: string | null): Draft | null {
  const catalog = useCatalog.getState();
  const read =
    catalog.catalog.status === "idle" ? null : catalog.catalog.serverId;

  if (!serverId || read !== serverId) {
    return null;
  }

  return { selected: catalog.selected, values: catalog.values };
}

// A list not yet read says nothing about the machine.
function unknownServer(serverId: string): boolean {
  const config = useServers.getState().config;

  return Boolean(config) && !config?.servers.some(({ id }) => id === serverId);
}

export const useOnboarding = create<OnboardingStore>((set, get) => {
  // The draft as it changed, not whatever the catalogue holds when the debounce fires.
  let pending: { serverId: string | null; draft: Draft } | null = null;

  // Bumped per sequence so work an earlier one left waiting is dropped.
  let sequence = 0;

  function persist(): void {
    const { serverId, installed, step } = get();

    if (step === "closed") {
      return;
    }

    const held = pending?.serverId === serverId ? pending.draft : null;
    const own = ownDraft(serverId) ?? held ?? shelved();
    const restored = get().restored ? useRestore.getState().restored : null;

    keep({ installed, restored, serverId, step, ...own });
  }

  let writing: ReturnType<typeof setTimeout> | null = null;

  function persistSoon(): void {
    const own = ownDraft(get().serverId);

    if (!own) {
      return;
    }

    pending = { draft: own, serverId: get().serverId };

    if (writing) {
      return;
    }

    writing = setTimeout(() => {
      writing = null;
      persist();
    }, DRAFT_PAUSE_MS);
  }

  function startInstall(serverId: string, owed: readonly string[]): void {
    const catalog = useCatalog.getState();
    const asked = owed.length > 0 ? owed : catalog.selected;
    const own = sequence;

    if (asked.length === 0 || useInstall.getState().install.status !== "idle") {
      return;
    }

    // Generated secrets land one round trip each: starting earlier would install a database without one.
    catalog.settled().then(() => {
      if (own !== sequence) {
        return;
      }

      useInstall.getState().start(
        serverId,
        asked,
        catalog.config(),
        catalog.deferred.filter((one) => asked.includes(one))
      );
    });
  }

  function run(effect: Effect): void {
    switch (effect.kind) {
      case "persist":
        persist();
        break;
      case "forget":
        pending = null;
        keep(null);
        break;
      case "inspect":
        useInspection.getState().inspect(effect.serverId);
        break;
      case "listBackups":
        listBackups();
        break;
      case "abortRestore":
        useRestore.getState().abort(effect.serverId);
        break;
      case "sendAgent":
        get().sendAgent();
        break;
      case "startInstall":
        startInstall(effect.serverId, effect.modules);
        break;
      case "startHarden":
        if (!hardening(effect.serverId)) {
          useHarden.getState().start(effect.serverId);
        }
        break;
      case "reloadReport":
        useInstall.getState().reload(effect.serverId);
        break;
      // Fire and forget: a failed sync only leaves the console stale until the daemon's next turn.
      case "platformSync":
        bridge()
          .syncPlatform?.(effect.serverId)
          ?.catch(() => undefined);
        break;
      case "reloadFleet":
        useFleet.getState().read();
        break;
      default:
        break;
    }
  }

  async function listBackups(): Promise<void> {
    const own = sequence;

    if (!bridge().listBackups) {
      return;
    }

    const count = await useRestore.getState().list();

    if (own === sequence) {
      send({ any: count > 0, type: "backupsListed" });
    }
  }

  function hardening(serverId: string): boolean {
    const { harden } = useHarden.getState();

    return (
      harden.status !== "idle" &&
      harden.status !== "done" &&
      harden.status !== "failed" &&
      harden.serverId === serverId
    );
  }

  function send(event: Event): void {
    const before = get().step;
    const { state, effects } = transition(get(), event);

    set(state);

    for (const effect of effects) {
      run(effect);
    }

    if (state.step !== before && state.step !== "closed") {
      announce(translate()(`onboarding.step.${state.step}`));
    }
  }

  // An install cut mid-run writes no report, so the probe is the only account of what is left.
  function settle(saved: Saved, installedModules: readonly string[]): void {
    const left = restored(
      useCatalog.getState().modules(),
      saved.selected,
      installedModules
    );

    if (left.length === 0) {
      if (saved.serverId) {
        useInstall.getState().reload(saved.serverId);
      }

      return;
    }

    // The vault left with the app, so a secret-carrying module goes back through the configuration.
    const asks = left.some((id) => {
      const manifest = manifestOf(id);

      return Boolean(manifest && carriesSecret(manifest));
    });

    send({
      remaining: left,
      step: asks ? "config" : "install",
      type: "resumeAt",
    });
  }

  async function recover(saved: Saved): Promise<void> {
    const serverId = saved.serverId;

    // Before the catalogue nothing was chosen, and those screens read the machine themselves.
    if (
      !serverId ||
      ONBOARDING_STEPS.indexOf(saved.step) < ONBOARDING_STEPS.indexOf("catalog")
    ) {
      return;
    }

    set({ recovering: true });

    try {
      // Waits on the probe the `resume` event already asked for.
      await useInspection.getState().inspect(serverId);

      const probe = probeOf(serverId);

      // Past the install the choice has become the machine: nothing is rebuilt.
      if (
        ONBOARDING_STEPS.indexOf(saved.step) >
        ONBOARDING_STEPS.indexOf("install")
      ) {
        return;
      }

      if (!probe) {
        send({ remaining: [], step: "inspection", type: "resumeAt" });

        return;
      }

      if (probe.agent_version === null) {
        send({ remaining: [], step: "agent", type: "resumeAt" });

        return;
      }

      const catalog = useCatalog.getState();

      await catalog.load(serverId, probe.installed_modules);
      catalog.restore(saved.selected, saved.values);

      if (saved.step === "install") {
        settle(saved, probe.installed_modules);
      }
    } finally {
      set({ recovering: false });
    }
  }

  function startOver(event: Event): void {
    sequence += 1;
    set({ delivery: { status: "idle" } });
    useRestore.getState().reset();
    send(event);
  }

  return {
    ...CLOSED,
    delivery: { status: "idle" },
    recovering: false,

    send,

    noteDraft: persistSoon,

    open() {
      startOver({ type: "open" });
    },

    begin(serverId) {
      startOver({ serverId, type: "begin" });
    },

    secure(serverId) {
      startOver({ serverId, type: "secure" });
    },

    canGoBack() {
      return allowedBack(get());
    },

    back() {
      send({ type: "back" });
    },

    replay(moduleId) {
      const manifest = manifestOf(moduleId);
      const asks = Boolean(manifest && carriesSecret(manifest));

      send({ carriesSecret: asks, moduleId, type: "replay" });

      return asks ? "config" : "install";
    },

    async sendAgent() {
      const { serverId, delivery } = get();

      if (!serverId || delivery.status === "sending") {
        return;
      }

      set({ delivery: { phase: "reading", status: "sending" } });

      const push = bridge().sendAgent;

      if (!push) {
        set({ delivery: { status: "idle" } });

        return;
      }

      const answer = await push(serverId, (phase) =>
        set((state) =>
          state.delivery.status === "sending"
            ? { delivery: { phase, status: "sending" } }
            : state
        )
      );

      set({
        delivery: answer.ok
          ? { delivery: answer.result, status: "sent" }
          : { error: answer.error, status: "failed" },
      });
    },

    async restoreFrom(backupId, passphrase) {
      const { serverId } = get();
      const own = sequence;

      if (!serverId) {
        return;
      }

      const taken = await useRestore
        .getState()
        .start(serverId, backupId, passphrase);

      if (taken && own === sequence) {
        send({ backupId, type: "restored" });
      }
    },

    async bringData(parts, passphrase) {
      const { serverId } = get();

      if (!serverId) {
        return;
      }

      await useRestore.getState().bringData(serverId, parts, passphrase);
    },

    async skipData() {
      const { serverId } = get();

      if (serverId) {
        await useRestore.getState().abort(serverId);
      }

      send({ type: "dataSkipped" });
    },

    close() {
      send({ type: "close" });
    },

    async resume() {
      const saved = savedOnboarding();

      if (!saved || saved.step === "done") {
        return;
      }

      if (saved.serverId && unknownServer(saved.serverId)) {
        keep(null);

        return;
      }

      sequence += 1;
      set({ delivery: { status: "idle" } });
      useRestore.getState().adopt(saved.restored);
      send({
        installed: saved.installed,
        restored: saved.restored?.backupId ?? null,
        serverId: saved.serverId,
        step: saved.step,
        type: "resume",
      });

      await recover(saved);
    },

    reset() {
      sequence += 1;
      keep(null);
      useRestore.getState().reset();
      set({ ...CLOSED, delivery: { status: "idle" }, recovering: false });
    },
  };
});

useServers.subscribe(() => {
  const { step, serverId } = useOnboarding.getState();

  if (step === "closed" || step === "server") {
    return;
  }

  if (!serverId || unknownServer(serverId)) {
    useOnboarding.getState().send({ type: "serverLost" });
  }
});

useAccount.subscribe((now, before) => {
  const lost = Boolean(accountOf(now.view)?.refusal);
  const had = Boolean(accountOf(before.view)?.refusal);

  if (lost !== had) {
    useOnboarding.getState().send({ type: lost ? "usageLost" : "usageBack" });
  }
});

useCatalog.subscribe(() => {
  const { step, serverId } = useOnboarding.getState();

  if (step !== "closed" && serverId) {
    useOnboarding.getState().noteDraft();
  }
});
