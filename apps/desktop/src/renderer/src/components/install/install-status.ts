import type { StepStatus } from "@pupitre/shared/agent-protocol/envelope";
import type { DictionaryKey } from "@renderer/i18n/en";
import type { ModuleStatus } from "../../stores/install";
import type { StatusShape, StatusTone } from "../ui/status-dot";

export interface Look {
  shape: StatusShape;
  tone: StatusTone;
  label: DictionaryKey;
}

/**
 * Five fates, five outlines. The tone only confirms what the shape already
 * says, so the whole screen survives being read in pure greys.
 */
export const MODULE_LOOK: Record<ModuleStatus, Look> = {
  pending: {
    label: "install.moduleStatus.pending",
    shape: "empty",
    tone: "neutral",
  },
  running: {
    label: "install.moduleStatus.running",
    shape: "breathing",
    tone: "neutral",
  },
  ok: { label: "install.moduleStatus.ok", shape: "filled", tone: "ok" },
  skip: { label: "install.moduleStatus.skip", shape: "empty", tone: "neutral" },
  fail: {
    label: "install.moduleStatus.fail",
    shape: "struck",
    tone: "danger",
  },
};

/** What a module's run is doing: installing it, backing it up, or bringing it back. */
export type ModuleWording = "install" | "backup" | "restore";

/** The fates a backup or a restore words its own way; the others read as an install's. */
export const MODULE_WORDS: Record<
  ModuleWording,
  Partial<Record<ModuleStatus, DictionaryKey>>
> = {
  backup: {
    ok: "install.moduleStatus.backedUp",
    running: "install.moduleStatus.backingUp",
  },
  install: {},
  restore: {
    ok: "install.moduleStatus.restored",
    running: "install.moduleStatus.restoring",
  },
};

/** A step that went through, but had something to say. */
export const WARNED_STEP: Look = {
  label: "install.stepStatus.warned",
  shape: "ringed",
  tone: "warn",
};

export const STEP_LOOK: Record<StepStatus, Look> = {
  start: {
    label: "install.stepStatus.start",
    shape: "breathing",
    tone: "neutral",
  },
  ok: { label: "install.stepStatus.ok", shape: "filled", tone: "ok" },
  skip: { label: "install.stepStatus.skip", shape: "empty", tone: "neutral" },
  fail: { label: "install.stepStatus.fail", shape: "struck", tone: "danger" },
};
