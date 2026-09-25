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
  /**
   * The catalogue choice and the answers typed under it, so an app closed
   * half-way opens on the same selection rather than on a blank form. No secret
   * is ever in here: they never reach this side of the bridge.
   */
  selected: readonly string[];
  values: Record<string, Record<string, unknown>>;
  /** The backup the machine took its configuration from, and the data parts it still owes. */
  restored: RestoredSetup | null;
}

const KEY = "pupitre.onboarding";

/** How long the form waits for a pause before the draft reaches the shelf. */
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

/**
 * The bridge to the main process, when there is a window to hold it.
 *
 * The machine runs an effect on entering a step, so a store exercised outside a
 * window — a test, a headless render — reaches for a bridge that is not there.
 * It answers nothing rather than throwing, and the step stands where it is.
 */
function bridge(): Partial<Window["pupitre"]> {
  return globalThis.window?.pupitre ?? {};
}

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
  /** The machine is being read again after a relaunch, before any screen acts. */
  recovering: boolean;
  delivery: DeliveryState;

  send: (event: Event) => void;
  /** The catalogue changed under an open onboarding: the draft follows, after a pause. */
  noteDraft: () => void;
  open: () => void;
  begin: (serverId: string) => void;
  secure: (serverId: string) => void;
  back: () => void;
  canGoBack: () => boolean;
  replay: (moduleId: string) => OnboardingStep;
  sendAgent: () => Promise<void>;
  /** The machine takes a backup's configuration; the catalogue opens on its choice. */
  restoreFrom: (backupId: string, passphrase: string) => Promise<void>;
  /** The data parts chosen, brought back once the machine stands; then the sequence is done. */
  bringData: (
    parts: readonly string[],
    passphrase: string | null
  ) => Promise<void>;
  /** The restore mark is let go and the data left in the bucket. */
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

/**
 * The choice this onboarding made, when the catalogue still holds it.
 *
 * The screens that add a service to another machine mount the same store, and
 * their selection has nothing to do with an onboarding waiting elsewhere: a
 * catalogue read for another server answers nothing at all rather than an
 * emptiness that would erase what is already on the shelf.
 */
function ownDraft(serverId: string | null): Draft | null {
  const catalog = useCatalog.getState();
  const read =
    catalog.catalog.status === "idle" ? null : catalog.catalog.serverId;

  if (!serverId || read !== serverId) {
    return null;
  }

  return { selected: catalog.selected, values: catalog.values };
}

/**
 * A server the list has read and does not hold. A list not yet read holds
 * nothing, and says nothing about the machine either.
 */
function unknownServer(serverId: string): boolean {
  const config = useServers.getState().config;

  return Boolean(config) && !config?.servers.some(({ id }) => id === serverId);
}

export const useOnboarding = create<OnboardingStore>((set, get) => {
  /**
   * The choice as it stood when it was last this server's.
   *
   * The pause below is what keeps a keystroke off the disk, and this is what
   * keeps the pause honest: what is written is the draft at the moment it
   * changed, not whatever the catalogue happens to hold when the timer fires.
   */
  let pending: { serverId: string | null; draft: Draft } | null = null;

  /** Which sequence is under way: what an earlier one left waiting is dropped. */
  let sequence = 0;

  /** A step is written down the moment it changes: it is what a resume reads first. */
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

  /**
   * The answers typed under the choice, written down as they are made: an app
   * closed on the configuration screen has to find them again when it opens.
   */
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

  /**
   * The install the step asks for: what a resumed onboarding still owes the
   * machine, or else the catalogue's choice. Nothing chosen is not an install
   * to run, and an install already under way is not started twice.
   */
  function startInstall(serverId: string, owed: readonly string[]): void {
    const catalog = useCatalog.getState();
    const asked = owed.length > 0 ? owed : catalog.selected;
    const own = sequence;

    if (asked.length === 0 || useInstall.getState().install.status !== "idle") {
      return;
    }

    // The generated secrets are made in the main process, one round trip each:
    // starting before they have landed would install a database without one.
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
      /**
       * The console is told at once rather than at the daemon's next turn. An
       * agent too old to answer, or a platform that is out of reach, costs five
       * minutes of a stale console and nothing else — so nothing here waits on
       * it, and nothing here fails on it.
       */
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

  /**
   * Whether the organization has backups to start from: the platform is asked
   * once the machine is chosen, and a platform out of reach offers none rather
   * than holding the sequence.
   */
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

  /** A hardening already under way on this machine is not asked for twice. */
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

  /**
   * What is left to install, once the machine has said what it already runs.
   *
   * Nothing is deduced from the events the app saw before it closed: an install
   * cut mid-run writes no report, so the probe is the only account of it. A
   * module that still has to be installed and carries a secret goes back
   * through the configuration, because the vault left with the app.
   */
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

  /**
   * The machine, read again before the resumed screen does anything to it.
   *
   * What comes back from the shelf is the step and the choice; what the server
   * runs comes from the server. The app never installs on the strength of what
   * it merely remembers.
   */
  async function recover(saved: Saved): Promise<void> {
    const serverId = saved.serverId;

    // Before the catalogue nothing had been chosen, and those screens read the
    // machine themselves anyway.
    if (
      !serverId ||
      ONBOARDING_STEPS.indexOf(saved.step) < ONBOARDING_STEPS.indexOf("catalog")
    ) {
      return;
    }

    set({ recovering: true });

    try {
      // The `resume` event already asked for the probe: this waits on that one.
      await useInspection.getState().inspect(serverId);

      const probe = probeOf(serverId);

      // Past the install the choice has become the machine: the probe is read
      // for what the last screens weigh against it, and nothing is rebuilt.
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

    /** Leaving the wizard keeps the progress: the servers screen offers it back. */
    close() {
      send({ type: "close" });
    },

    async resume() {
      const saved = savedOnboarding();

      if (!saved || saved.step === "done") {
        return;
      }

      // A sequence about a machine the app no longer knows is not offered back:
      // every step after the choice would ask something of a server that is
      // gone. The list is only consulted once it has been read.
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

/**
 * A machine that leaves the list takes the sequence about it with it.
 *
 * It is removed from the settings, or a relaunch reads a list it is no longer
 * in: either way the steps that follow the choice have nothing to run on, and
 * the onboarding goes back to the choice rather than showing a screen whose
 * only answer the machine would refuse.
 */
useServers.subscribe(() => {
  const { step, serverId } = useOnboarding.getState();

  if (step === "closed" || step === "server") {
    return;
  }

  if (!serverId || unknownServer(serverId)) {
    useOnboarding.getState().send({ type: "serverLost" });
  }
});

/**
 * A usage right the platform stopped confirming freezes the step rather than
 * failing it: the machine holds, and takes up again when the account does.
 */
useAccount.subscribe((now, before) => {
  const lost = Boolean(accountOf(now.view)?.refusal);
  const had = Boolean(accountOf(before.view)?.refusal);

  if (lost !== had) {
    useOnboarding.getState().send({ type: lost ? "usageLost" : "usageBack" });
  }
});

/**
 * A change made in the catalogue, and not by a step, still reaches the shelf.
 *
 * It goes through the store's own pause rather than writing on every keystroke,
 * and it writes nothing at all while no onboarding is open.
 */
useCatalog.subscribe(() => {
  const { step, serverId } = useOnboarding.getState();

  if (step !== "closed" && serverId) {
    useOnboarding.getState().noteDraft();
  }
});
