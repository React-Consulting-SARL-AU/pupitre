/**
 * The order of the onboarding, and what each answer means for the step after it.
 *
 * Nothing here touches a store, a screen or a server: it says which step
 * follows which answer, what must happen on entering one, and what a step that
 * is taken up again owes the machine. That is the whole of the sequence, and it
 * can be read — and tested — without an app around it.
 *
 * The binary comes before the catalogue and not with the install: a bare
 * machine has nothing to answer `catalog` with until `pupitred` sits on it.
 * Going back is allowed as long as nothing has been installed; after that the
 * machine has changed, and a screen offering a way back would be lying.
 */

export const ONBOARDING_STEPS = [
  "server",
  "inspection",
  "agent",
  "catalog",
  "config",
  "install",
  "harden",
  "done",
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

/** `closed` is the app as it stands: the onboarding is a screen, not a mode. */
export type OnboardingView = OnboardingStep | "closed";

/** The sub-steps of choosing a machine, which the rail shows and the step owns. */
export const SERVER_STAGES = ["pick", "add", "key"] as const;

export type ServerStage = (typeof SERVER_STAGES)[number];

export interface MachineState {
  step: OnboardingView;
  serverId: string | null;
  /** True once a module has started: the machine has changed, and so has the way back. */
  installed: boolean;
  /** The module whose configuration is being asked again before a replay. */
  replaying: string | null;
  /** What an interrupted onboarding still owes the machine. */
  remaining: readonly string[];
  /** The platform has not confirmed the usage right: every step holds where it is. */
  frozen: boolean;
  /**
   * The steps actually walked, in order.
   *
   * Going back returns to where the reader came from, not to whatever precedes
   * the current step in the list: a machine that already ran the agent skips
   * that step on the way forward, and offering it on the way back would send
   * the reader somewhere they have never been.
   */
  trail: readonly OnboardingStep[];
}

export const CLOSED: MachineState = {
  frozen: false,
  installed: false,
  remaining: [],
  replaying: null,
  serverId: null,
  step: "closed",
  trail: [],
};

export type Effect =
  | { kind: "persist" }
  | { kind: "forget" }
  | { kind: "inspect"; serverId: string }
  | { kind: "sendAgent"; serverId: string }
  | { kind: "startInstall"; serverId: string; modules: readonly string[] }
  | { kind: "startHarden"; serverId: string }
  | { kind: "reloadReport"; serverId: string }
  | { kind: "platformSync"; serverId: string }
  | { kind: "reloadFleet" };

export type Event =
  | { type: "open" }
  | { type: "begin"; serverId: string }
  | { type: "serverChosen"; serverId: string }
  | { type: "inspected" }
  | { type: "needsAgent" }
  | { type: "agentSent" }
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

/**
 * The steps a sequence walks, as far as the machine can tell.
 *
 * The agent step is the one that is not always there: a machine already
 * running the agent skips it. Past the inspection the trail says whether it
 * was walked; before it, the verdict says whether it will be — a managed
 * machine that is up to date never enters it, a bare one always does, and one
 * whose agent is behind may go either way, so it is counted until the reader
 * decides. Without a verdict every step is counted.
 */
export function plannedSteps(
  state: Pick<MachineState, "step" | "trail">,
  verdict: { kind: string; up_to_date?: boolean } | null
): readonly OnboardingStep[] {
  const here = ONBOARDING_STEPS.indexOf(state.step as OnboardingStep);
  const pastInspection = here > ONBOARDING_STEPS.indexOf("inspection");

  let withAgent = true;

  if (pastInspection) {
    withAgent = state.step === "agent" || state.trail.includes("agent");
  } else if (verdict) {
    withAgent = !(verdict.kind === "managed" && verdict.up_to_date !== false);
  }

  return ONBOARDING_STEPS.filter((step) => step !== "agent" || withAgent);
}

/**
 * The steps a resumed sequence stands on: everything before the resumed step,
 * the agent step aside — a machine resumed past it already runs the agent, and
 * a way back to a delivery screen with nothing to deliver would be a lie.
 */
export function walkedBefore(step: OnboardingStep): readonly OnboardingStep[] {
  return ONBOARDING_STEPS.slice(0, ONBOARDING_STEPS.indexOf(step)).filter(
    (walked) => walked !== "agent"
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

/** Which step an answer may be given from: an answer given elsewhere is not one. */
const ANSWERED_AT: Partial<Record<Event["type"], readonly OnboardingStep[]>> = {
  agentSent: ["agent"],
  chosen: ["catalog"],
  configured: ["config"],
  hardened: ["harden"],
  inspected: ["inspection"],
  installed: ["install"],
  needsAgent: ["inspection"],
  pickAnother: ["server", "inspection"],
  replay: ["install"],
  replayConfigured: ["config"],
  serverChosen: ["server"],
};

/** What happens on arriving at a step, before its screen has drawn anything. */
function onEnter(state: MachineState): Effect[] {
  const { serverId, step } = state;

  if (!serverId) {
    return [];
  }

  switch (step) {
    case "inspection":
      return [{ kind: "inspect", serverId }];
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

/**
 * A new onboarding starts on an empty shelf: the choice made for another
 * machine, or for another attempt at this one, is not this one's to inherit.
 */
function start(state: MachineState, step: OnboardingStep): Transition {
  const moved = move({ ...state, trail: [] }, step);

  return {
    ...moved,
    effects: [{ kind: "forget" }, ...moved.effects],
    state: { ...moved.state, trail: [] },
  };
}

/**
 * The one place a step follows another.
 *
 * A step is never reached by naming it: it is reached by an event that
 * justifies it, which is what keeps the install screen from opening on an
 * empty selection and the rail from counting steps nobody walked.
 */
export function transition(state: MachineState, event: Event): Transition {
  // A usage right the platform stopped confirming freezes the step where it is:
  // reading goes on, and nothing is asked of the machine until it comes back.
  if (event.type === "usageLost") {
    return { effects: [], state: { ...state, frozen: true } };
  }

  if (event.type === "usageBack") {
    return { effects: [], state: { ...state, frozen: false } };
  }

  if (state.frozen && event.type !== "close" && event.type !== "back") {
    return { effects: [], state };
  }

  // An answer is only an answer where it was asked: nothing else opens a step.
  const allowed = ANSWERED_AT[event.type];

  if (allowed && !allowed.includes(state.step as OnboardingStep)) {
    return { effects: [], state };
  }

  switch (event.type) {
    case "open":
      return start({ ...CLOSED }, "server");

    case "begin":
      return start({ ...CLOSED, serverId: event.serverId }, "inspection");

    case "serverChosen":
      return move({ ...state, serverId: event.serverId }, "inspection");

    case "pickAnother":
      return move({ ...state, serverId: null }, "server");

    /**
     * The machine this sequence was about is not one the app knows any more: it
     * was removed, or the list came back without it. Nothing that follows has
     * anything to run on, so the choice starts over rather than the sequence
     * holding on a screen whose only answer it would refuse. A sequence already
     * finished has nothing to start over, and closes.
     */
    case "serverLost": {
      if (state.step === "closed" || state.step === "server") {
        return { effects: [], state };
      }

      return state.step === "done"
        ? { effects: [{ kind: "forget" }], state: { ...CLOSED } }
        : start({ ...CLOSED }, "server");
    }

    case "inspected":
      return move(state, "catalog");

    case "needsAgent":
      return move(state, "agent");

    case "agentSent":
      return move(state, "catalog");

    case "chosen":
      return move(state, "config");

    case "configured":
      return move({ ...state, remaining: [] }, "install");

    /** From here the machine has changed: the way back is the way through. */
    case "touched":
      return {
        effects: [{ kind: "persist" }],
        state: { ...state, installed: true },
      };

    case "installed":
      return withSync(move({ ...state, installed: true }, "harden"));

    case "hardened": {
      const done = withSync(move(state, "done"));

      return { ...done, effects: [...done.effects, { kind: "reloadFleet" }] };
    }

    /**
     * The vault was emptied when the secrets left, so a module that carried one
     * cannot simply run again: its configuration is asked a second time.
     */
    case "replay":
      return event.carriesSecret
        ? move({ ...state, replaying: event.moduleId }, "config")
        : { effects: [], state };

    case "replayConfigured":
      return move({ ...state, replaying: null }, "install");

    case "back": {
      if (!canGoBack(state)) {
        return { effects: [], state };
      }

      const back = state.trail.at(-1) as OnboardingStep;
      const walked = state.trail.slice(0, -1);

      // A step walked back to was already entered and already acted: nothing
      // is sent or read again, and the trail does not count it twice.
      return {
        effects: [{ kind: "persist" }],
        state: { ...state, step: back, trail: walked },
      };
    }

    /**
     * A resumed onboarding takes the step from the shelf and everything else
     * from the server: what it runs, and therefore what is left to do. Nothing
     * is installed on the strength of what the app merely remembers asking for.
     */
    case "resume":
      return {
        effects: event.serverId
          ? [
              { kind: "inspect", serverId: event.serverId },
              // The hardening leaves no report to read back: a sequence
              // taken up on that step runs it again, like entering it does.
              ...(event.step === "harden"
                ? [{ kind: "startHarden" as const, serverId: event.serverId }]
                : []),
            ]
          : [],
        state: {
          ...CLOSED,
          installed: event.installed,
          serverId: event.serverId,
          step: event.step,
          // A resumed onboarding walked its steps in another run: the trail is
          // put back as that run must have walked it, so the way back stands.
          trail: walkedBefore(event.step),
        },
      };

    /**
     * The machine, read again, says where the sequence really stands: the
     * trail follows that step rather than the one the shelf remembered.
     */
    case "resumeAt": {
      const moved = move({ ...state, remaining: event.remaining }, event.step);

      return {
        ...moved,
        state: { ...moved.state, trail: walkedBefore(event.step) },
      };
    }

    /**
     * Leaving keeps the progress, so the servers screen can offer it back —
     * except from `done`, where there is nothing left to come back to. A
     * finished sequence left on the shelf is read as an install that stopped
     * half-way, under a button whose only answer is to refuse to resume it.
     */
    case "close":
      return {
        effects: state.step === "done" ? [{ kind: "forget" }] : [],
        state: { ...state, step: "closed" },
      };

    default:
      return { effects: [], state };
  }
}

/** The console learns what the machine now runs, rather than at the daemon's next turn. */
function withSync(transition: Transition): Transition {
  const { serverId } = transition.state;

  return serverId
    ? {
        ...transition,
        effects: [...transition.effects, { kind: "platformSync", serverId }],
      }
    : transition;
}
