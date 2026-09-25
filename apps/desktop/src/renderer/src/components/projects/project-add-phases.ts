import type { DictionaryKey } from "@renderer/i18n/en";
import type { PhaseId, PhaseStatus } from "../../stores/project-add";
import type { StatusShape, StatusTone } from "../ui/status-dot";

export const PHASE_TITLES: Record<PhaseId, DictionaryKey> = {
  add: "projectAdd.phase.add.title",
  install: "projectAdd.phase.install.title",
  logs: "projectAdd.phase.logs.title",
  publish: "projectAdd.phase.publish.title",
  sources: "projectAdd.phase.sources.title",
  up: "projectAdd.phase.up.title",
};

export interface PhaseLook {
  shape: StatusShape;
  tone: StatusTone;
  label: DictionaryKey;
}

// Each shape alone must tell the status apart: the tone only confirms it, so greys still read.
export const PHASE_LOOK: Record<PhaseStatus, PhaseLook> = {
  fail: {
    label: "projectAdd.phaseStatus.fail",
    shape: "struck",
    tone: "danger",
  },
  ok: { label: "projectAdd.phaseStatus.ok", shape: "filled", tone: "ok" },
  pending: {
    label: "projectAdd.phaseStatus.pending",
    shape: "empty",
    tone: "neutral",
  },
  running: {
    label: "projectAdd.phaseStatus.running",
    shape: "breathing",
    tone: "neutral",
  },
  skip: {
    label: "projectAdd.phaseStatus.skip",
    shape: "empty",
    tone: "neutral",
  },
};
