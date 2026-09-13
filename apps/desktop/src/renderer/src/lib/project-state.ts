import type {
  LoginState,
  ProjectState,
  ServiceState,
} from "@pupitre/shared/agent-protocol/state";
import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";
import type { DictionaryKey } from "@renderer/i18n/en";

/**
 * What each state of the protocol looks like, and what it is called here.
 *
 * The shape carries the meaning and the tone only confirms it, so the screen
 * survives being read in pure greys. The label is a dictionary key — the agent
 * sends an identifier, not a sentence, and the word is the app's to translate.
 */

export interface StateLook {
  label: DictionaryKey;
  shape: StatusShape;
  tone: StatusTone;
  frame: string;
}

const NEUTRAL_FRAME = "border-line-strong";

export const PROJECT_LOOK: Record<ProjectState, StateLook> = {
  down: {
    frame: "border-danger/40",
    label: "state.project.down",
    shape: "struck",
    tone: "danger",
  },
  external: {
    frame: "border-ok/40",
    label: "state.project.external",
    shape: "filled",
    tone: "ok",
  },
  failed: {
    frame: "border-danger/40",
    label: "state.project.failed",
    shape: "struck",
    tone: "danger",
  },
  online: {
    frame: "border-ok/40",
    label: "state.project.online",
    shape: "filled",
    tone: "ok",
  },
  service: {
    frame: "border-ok/40",
    label: "state.project.service",
    shape: "filled",
    tone: "ok",
  },
  starting: {
    frame: "border-warn/40",
    label: "state.project.starting",
    shape: "breathing",
    tone: "warn",
  },
  stopped: {
    frame: NEUTRAL_FRAME,
    label: "state.project.stopped",
    shape: "empty",
    tone: "neutral",
  },
};

/**
 * A module put on the machine and left unconfigured.
 *
 * It is not a failure and not a service that stopped: nobody has answered its
 * questions yet, and the shape has to say that rather than borrow an alarm.
 */
export const UNCONFIGURED_LOOK: StateLook = {
  frame: "border-warn/40",
  label: "state.service.unconfigured",
  shape: "ringed",
  tone: "warn",
};

export const SERVICE_LOOK: Record<ServiceState, StateLook> = {
  failed: {
    frame: "border-danger/40",
    label: "state.service.failed",
    shape: "struck",
    tone: "danger",
  },
  running: {
    frame: "border-ok/40",
    label: "state.service.running",
    shape: "filled",
    tone: "ok",
  },
  stopped: {
    frame: NEUTRAL_FRAME,
    label: "state.service.stopped",
    shape: "empty",
    tone: "neutral",
  },
  unknown: {
    frame: NEUTRAL_FRAME,
    label: "state.service.unknown",
    shape: "empty",
    tone: "neutral",
  },
};

/**
 * What a CLI says of its own account.
 *
 * Not signed in is the ringed dot of something waiting for the reader, never
 * an alarm: the CLI works, it just has nobody to work as. No answer is the
 * hollow dot of a state nobody could read.
 */
export const LOGIN_LOOK: Record<LoginState, StateLook> = {
  signed_in: {
    frame: "border-ok/40",
    label: "state.login.signed_in",
    shape: "filled",
    tone: "ok",
  },
  signed_out: {
    frame: "border-warn/40",
    label: "state.login.signed_out",
    shape: "ringed",
    tone: "warn",
  },
  unknown: {
    frame: NEUTRAL_FRAME,
    label: "state.login.unknown",
    shape: "empty",
    tone: "neutral",
  },
};

const RUNNING: readonly ProjectState[] = ["online", "service", "external"];

export function isRunning(state: ProjectState): boolean {
  return RUNNING.includes(state);
}
