import type {
  LoginState,
  ProcessState,
  ProjectState,
  ServiceState,
} from "@pupitre/shared/agent-protocol/state";
import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";
import type { DictionaryKey } from "@renderer/i18n/en";

/** The shape carries the meaning and the tone only confirms it, so the screen reads in pure greys. */
export interface StateLook {
  label: DictionaryKey;
  shape: StatusShape;
  tone: StatusTone;
  frame: string;
}

const NEUTRAL_FRAME = "border-line-strong";

export const PROCESS_LOOK: Record<ProcessState, StateLook> = {
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

export const PROJECT_LOOK: Record<ProjectState, StateLook> = {
  ...PROCESS_LOOK,
  partial: {
    frame: "border-warn/40",
    label: "state.project.partial",
    shape: "ringed",
    tone: "warn",
  },
};

/** Not a failure: nobody has answered the module's questions yet, so no alarm shape. */
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

/** Signed out waits for the reader rather than alarms: the CLI still works, as nobody. */
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

const RUNNING: readonly ProjectState[] = [
  "online",
  "service",
  "external",
  "partial",
];

/** A partial project counts: it has processes to stop and a restart to offer. */
export function isRunning(state: ProjectState): boolean {
  return RUNNING.includes(state);
}
