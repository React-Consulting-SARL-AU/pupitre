// "agent" precedes "catalog": a bare machine cannot answer `catalog` until pupitred sits on it.
export const ONBOARDING_STEPS = [
  "server",
  "inspection",
  "agent",
  "restore",
  "catalog",
  "config",
  "install",
  "harden",
  "data",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export type OnboardingView = OnboardingStep | "closed";

export const SERVER_STAGES = ["pick", "add", "key"] as const;

export type ServerStage = (typeof SERVER_STAGES)[number];

export interface MachineState {
  step: OnboardingView;
  serverId: string | null;
  /** Once a module has started the machine has changed, so going back is no longer offered. */
  installed: boolean;
  replaying: string | null;
  /** Modules an interrupted onboarding still has to install. */
  remaining: readonly string[];
  /** Set while the platform does not confirm the usage right: every step holds where it is. */
  frozen: boolean;
  backups: boolean;
  /** Backup whose configuration the machine took; its data comes back after the hardening. */
  restored: string | null;
  /** Steps actually walked: going back follows it, never the list, since the agent step may be skipped. */
  trail: readonly OnboardingStep[];
}

export const CLOSED: MachineState = {
  backups: false,
  frozen: false,
  installed: false,
  remaining: [],
  replaying: null,
  restored: null,
  serverId: null,
  step: "closed",
  trail: [],
};

export type Effect =
  | { kind: "persist" }
  | { kind: "forget" }
  | { kind: "inspect"; serverId: string }
  | { kind: "listBackups" }
  | { kind: "abortRestore"; serverId: string }
  | { kind: "sendAgent"; serverId: string }
  | { kind: "startInstall"; serverId: string; modules: readonly string[] }
  | { kind: "startHarden"; serverId: string }
  | { kind: "reloadReport"; serverId: string }
  | { kind: "platformSync"; serverId: string }
  | { kind: "reloadFleet" };

export type Event =
  | { type: "open" }
  | { type: "begin"; serverId: string }
  /** An installed server whose root stayed open takes the hardening step again, alone. */
  | { type: "secure"; serverId: string }
  | { type: "serverChosen"; serverId: string }
  | { type: "inspected" }
  | { type: "needsAgent" }
  | { type: "agentSent" }
  | { type: "backupsListed"; any: boolean }
  | { type: "restored"; backupId: string }
  | { type: "restoreSkipped" }
  | { type: "dataRestored" }
  | { type: "dataSkipped" }
  | { type: "chosen" }
  | { type: "configured" }
  | { type: "touched" }
  | { type: "installed" }
  | { type: "hardened" }
  | { type: "replay"; moduleId: string; carriesSecret: boolean }
  | { type: "replayConfigured" }
  | {
      type: "resume";
      step: OnboardingStep;
      serverId: string | null;
      installed: boolean;
      restored: string | null;
    }
  | { type: "resumeAt"; step: OnboardingStep; remaining: readonly string[] }
  | { type: "back" }
  | { type: "pickAnother" }
  | { type: "serverLost" }
  | { type: "usageLost" }
  | { type: "usageBack" }
  | { type: "close" };

export interface Transition {
  state: MachineState;
  effects: readonly Effect[];
}

export function plannedSteps(
  state: Pick<MachineState, "step" | "trail" | "backups" | "restored">,
  verdict: { kind: string; up_to_date?: boolean } | null
): readonly OnboardingStep[] {
  const here = ONBOARDING_STEPS.indexOf(state.step as OnboardingStep);
  const pastInspection = here > ONBOARDING_STEPS.indexOf("inspection");

  let withAgent = true;

  if (pastInspection) {
    withAgent = state.step === "agent" || state.trail.includes("agent");
  } else if (verdict) {
    // An agent that is behind may or may not be updated: its step counts until the reader decides.
    withAgent = !(verdict.kind === "managed" && verdict.up_to_date !== false);
  }

  const withRestore =
    state.backups ||
    state.step === "restore" ||
    state.trail.includes("restore");
  const withData = state.restored !== null || state.step === "data";

  return ONBOARDING_STEPS.filter(
    (step) =>
      (step !== "agent" || withAgent) &&
      (step !== "restore" || withRestore) &&
      (step !== "data" || withData)
  );
}

/** Excludes the agent step: a machine resumed past it already runs the agent, so there is nothing to deliver. */
export function walkedBefore(
  step: OnboardingStep,
  restored: string | null = null
): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.slice(0, ONBOARDING_STEPS.indexOf(step)).filter(
    (walked) =>
      walked !== "agent" &&
      walked !== "data" &&
      (walked !== "restore" || restored !== null)
  );
}

export function canGoBack(state: MachineState): boolean {
  return (
    !state.installed &&
    state.step !== "closed" &&
    state.step !== "done" &&
    state.trail.length > 0
  );
}

const ANSWERED_AT: Partial<Record<Event["type"], readonly OnboardingStep[]>> = {
  agentSent: ["agent"],
  chosen: ["catalog"],
  configured: ["config"],
  dataRestored: ["data"],
  dataSkipped: ["data"],
  hardened: ["harden"],
  restoreSkipped: ["restore"],
  restored: ["restore"],
  inspected: ["inspection"],
  installed: ["install"],
  needsAgent: ["inspection"],
  pickAnother: ["server", "inspection"],
  replay: ["install"],
  replayConfigured: ["config"],
  serverChosen: ["server"],
};

function onEnter(state: MachineState): Effect[] {
  const { serverId, step } = state;

  if (!serverId) {
    return [];
  }

  switch (step) {
    case "inspection":
      return [{ kind: "inspect", serverId }, { kind: "listBackups" }];
    case "agent":
      return [{ kind: "sendAgent", serverId }];
    case "install":
      return [{ kind: "startInstall", modules: state.remaining, serverId }];
    case "harden":
      return [{ kind: "startHarden", serverId }];
    default:
      return [];
  }
}

function move(state: MachineState, step: OnboardingView): Transition {
  const walked =
    step === "closed" || state.step === "closed" || step === state.step
      ? state.trail
      : [...state.trail, state.step as OnboardingStep];

  const next = { ...state, step, trail: walked };

  return {
    effects: [
      ...onEnter(next),
      step === "closed"
        ? { kind: "forget" as const }
        : { kind: "persist" as const },
    ],
    state: next,
  };
}

// A new onboarding forgets the shelf: another attempt's choice is not this one's to inherit.
function start(state: MachineState, step: OnboardingStep): Transition {
  const moved = move({ ...state, trail: [] }, step);

  return {
    ...moved,
    effects: [{ kind: "forget" }, ...moved.effects],
    state: { ...moved.state, trail: [] },
  };
}

export function transition(state: MachineState, event: Event): Transition {
  if (event.type === "usageLost") {
    return { effects: [], state: { ...state, frozen: true } };
  }

  if (event.type === "usageBack") {
    return { effects: [], state: { ...state, frozen: false } };
  }

  if (state.frozen && event.type !== "close" && event.type !== "back") {
    return { effects: [], state };
  }

  const allowed = ANSWERED_AT[event.type];

  if (allowed && !allowed.includes(state.step as OnboardingStep)) {
    return { effects: [], state };
  }

  switch (event.type) {
    case "open":
      return start({ ...CLOSED }, "server");

    case "begin":
      return start({ ...CLOSED, serverId: event.serverId }, "inspection");

    case "secure":
      return start(
        { ...CLOSED, installed: true, serverId: event.serverId },
        "harden"
      );

    case "serverChosen":
      return move({ ...state, serverId: event.serverId }, "inspection");

    case "pickAnother":
      return move({ ...state, serverId: null }, "server");

    case "serverLost": {
      if (state.step === "closed" || state.step === "server") {
        return { effects: [], state };
      }

      return state.step === "done"
        ? { effects: [{ kind: "forget" }], state: { ...CLOSED } }
        : start({ ...CLOSED }, "server");
    }

    case "inspected":
    case "agentSent":
      return afterAgent(state);

    case "needsAgent":
      return move(state, "agent");

    // Accepted at any step: it only decides where the agent step leads.
    case "backupsListed":
      return { effects: [], state: { ...state, backups: event.any } };

    case "restored":
      return move({ ...state, restored: event.backupId }, "catalog");

    case "restoreSkipped":
      return move(state, "catalog");

    case "dataRestored":
    case "dataSkipped":
      return finish(state);

    case "chosen":
      return move(state, "config");

    case "configured":
      return move({ ...state, remaining: [] }, "install");

    case "touched":
      return {
        effects: [{ kind: "persist" }],
        state: { ...state, installed: true },
      };

    case "installed":
      return withSync(move({ ...state, installed: true }, "harden"));

    case "hardened":
      return afterHardening(state);

    // The vault is emptied once the secrets leave, so a module carrying one is configured again.
    case "replay":
      return event.carriesSecret
        ? move({ ...state, replaying: event.moduleId }, "config")
        : { effects: [], state };

    case "replayConfigured":
      return move({ ...state, replaying: null }, "install");

    case "back":
      return stepBack(state);

    case "resume":
      return {
        effects: event.serverId
          ? [
              { kind: "inspect", serverId: event.serverId },
              { kind: "listBackups" },
              // Hardening leaves no report to read back, so resuming on it runs it again.
              ...(event.step === "harden"
                ? [{ kind: "startHarden" as const, serverId: event.serverId }]
                : []),
            ]
          : [],
        state: {
          ...CLOSED,
          installed: event.installed,
          restored: event.restored,
          serverId: event.serverId,
          step: event.step,
          trail: walkedBefore(event.step, event.restored),
        },
      };

    case "resumeAt": {
      const moved = move({ ...state, remaining: event.remaining }, event.step);

      return {
        ...moved,
        state: {
          ...moved.state,
          trail: walkedBefore(event.step, state.restored),
        },
      };
    }

    // A finished sequence left on the shelf would read as an install stopped half-way.
    case "close":
      return {
        effects: state.step === "done" ? [{ kind: "forget" }] : [],
        state: { ...state, step: "closed" },
      };

    default:
      return { effects: [], state };
  }
}

function afterAgent(state: MachineState): Transition {
  return move(state, state.backups ? "restore" : "catalog");
}

function afterHardening(state: MachineState): Transition {
  return state.restored ? move(state, "data") : finish(state);
}

function finish(state: MachineState): Transition {
  const done = withSync(move(state, "done"));

  return { ...done, effects: [...done.effects, { kind: "reloadFleet" }] };
}

// A step walked back to re-runs nothing, except that a taken backup is let go so the choice reopens.
function stepBack(state: MachineState): Transition {
  if (!canGoBack(state)) {
    return { effects: [], state };
  }

  const back = state.trail.at(-1) as OnboardingStep;
  const walked = state.trail.slice(0, -1);
  const letGo = back === "restore" && state.restored ? state.serverId : null;

  return {
    effects: [
      ...(letGo ? [{ kind: "abortRestore" as const, serverId: letGo }] : []),
      { kind: "persist" },
    ],
    state: {
      ...state,
      restored: letGo ? null : state.restored,
      step: back,
      trail: walked,
    },
  };
}

function withSync(transition: Transition): Transition {
  const { serverId } = transition.state;

  return serverId
    ? {
        ...transition,
        effects: [...transition.effects, { kind: "platformSync", serverId }],
      }
    : transition;
}
