import type {
  ProjectState,
  ServiceState,
} from "@pupitre/shared/agent-protocol/state";
import type {
  StatusShape,
  StatusTone,
} from "@renderer/components/ui/status-dot";

/**
 * What each state of the protocol looks like, and what it is called here.
 *
 * The shape carries the meaning and the tone only confirms it, so the screen
 * survives being read in pure greys. The words are the app's — the agent sends
 * an identifier, not a sentence.
 */

export interface StateLook {
  label: string;
  shape: StatusShape;
  tone: StatusTone;
  frame: string;
}

const NEUTRAL_FRAME = "border-line-strong";

export const PROJECT_LOOK: Record<ProjectState, StateLook> = {
  down: {
    frame: "border-danger/40",
    label: "tombé",
    shape: "struck",
    tone: "danger",
  },
  external: {
    frame: "border-ok/40",
    label: "externe",
    shape: "filled",
    tone: "ok",
  },
  failed: {
    frame: "border-danger/40",
    label: "en échec",
    shape: "struck",
    tone: "danger",
  },
  online: {
    frame: "border-ok/40",
    label: "en ligne",
    shape: "filled",
    tone: "ok",
  },
  service: {
    frame: "border-ok/40",
    label: "service",
    shape: "filled",
    tone: "ok",
  },
  starting: {
    frame: "border-warn/40",
    label: "démarre",
    shape: "breathing",
    tone: "warn",
  },
  stopped: {
    frame: NEUTRAL_FRAME,
    label: "arrêté",
    shape: "empty",
    tone: "neutral",
  },
};

export const SERVICE_LOOK: Record<ServiceState, StateLook> = {
  failed: {
    frame: "border-danger/40",
    label: "en échec",
    shape: "struck",
    tone: "danger",
  },
  running: {
    frame: "border-ok/40",
    label: "actif",
    shape: "filled",
    tone: "ok",
  },
  stopped: {
    frame: NEUTRAL_FRAME,
    label: "arrêté",
    shape: "empty",
    tone: "neutral",
  },
  unknown: {
    frame: NEUTRAL_FRAME,
    label: "inconnu",
    shape: "empty",
    tone: "neutral",
  },
};

const RUNNING: readonly ProjectState[] = ["online", "service", "external"];

export function isRunning(state: ProjectState): boolean {
  return RUNNING.includes(state);
}
