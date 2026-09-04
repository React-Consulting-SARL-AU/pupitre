import type { StepStatus } from "@pupitre/shared/agent-protocol/envelope";
import type { ModuleStatus } from "../../stores/install";
import type { StatusShape, StatusTone } from "../ui/status-dot";

export type Look = {
  shape: StatusShape;
  tone: StatusTone;
  label: string;
};

/**
 * Five fates, five outlines. The tone only confirms what the shape already
 * says, so the whole screen survives being read in pure greys.
 */
export const MODULE_LOOK: Record<ModuleStatus, Look> = {
  pending: { label: "en attente", shape: "empty", tone: "neutral" },
  running: { label: "en cours", shape: "breathing", tone: "neutral" },
  ok: { label: "réussi", shape: "filled", tone: "ok" },
  skip: { label: "ignoré", shape: "empty", tone: "neutral" },
  fail: { label: "en échec", shape: "struck", tone: "danger" },
};

export const STEP_LOOK: Record<StepStatus, Look> = {
  start: { label: "en cours", shape: "breathing", tone: "neutral" },
  ok: { label: "réussie", shape: "filled", tone: "ok" },
  skip: { label: "ignorée", shape: "empty", tone: "neutral" },
  fail: { label: "en échec", shape: "struck", tone: "danger" },
};
