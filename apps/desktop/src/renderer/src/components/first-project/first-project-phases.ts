import type { DictionaryKey } from "@renderer/i18n/en";
import type { PhaseId, PhaseStatus } from "../../stores/first-project";
import type { StatusShape, StatusTone } from "../ui/status-dot";

export const PHASE_TITLES: Record<PhaseId, DictionaryKey> = {
  add: "firstProject.phase.add.title",
  install: "firstProject.phase.install.title",
  logs: "firstProject.phase.logs.title",
  sources: "firstProject.phase.sources.title",
  up: "firstProject.phase.up.title",
};

/** What each phase is doing while it runs, so no wait is ever mute. */
export const PHASE_DOING: Record<PhaseId, DictionaryKey> = {
  add: "firstProject.phase.add.doing",
  install: "firstProject.phase.install.doing",
  logs: "firstProject.phase.logs.doing",
  sources: "firstProject.phase.sources.doing",
  up: "firstProject.phase.up.doing",
};

export interface PhaseLook {
  shape: StatusShape;
  tone: StatusTone;
  label: DictionaryKey;
}

/**
 * Five fates, five outlines. The tone only confirms what the shape already
 * says, so the whole screen survives being read in pure greys.
 */
export const PHASE_LOOK: Record<PhaseStatus, PhaseLook> = {
  fail: {
    label: "firstProject.phaseStatus.fail",
    shape: "struck",
    tone: "danger",
  },
  ok: { label: "firstProject.phaseStatus.ok", shape: "filled", tone: "ok" },
  pending: {
    label: "firstProject.phaseStatus.pending",
    shape: "empty",
    tone: "neutral",
  },
  running: {
    label: "firstProject.phaseStatus.running",
    shape: "breathing",
    tone: "neutral",
  },
  skip: {
    label: "firstProject.phaseStatus.skip",
    shape: "empty",
    tone: "neutral",
  },
};
