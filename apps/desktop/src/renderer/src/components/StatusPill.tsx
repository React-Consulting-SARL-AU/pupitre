import type { ProjectState } from "@shared/contract";
import { StatusDot, type StatusShape, type StatusTone } from "./ui/status-dot";

/**
 * The state reads through its shape as much as its colour: colour alone would
 * exclude those who cannot tell them apart, and a table you scan needs a marker
 * that catches the eye before the reading.
 */
const APPEARANCE: Record<
  ProjectState,
  { text: string; shape: StatusShape; tone: StatusTone; frame: string }
> = {
  online: {
    text: "online",
    shape: "filled",
    tone: "ok",
    frame: "border-ok/40",
  },
  service: {
    text: "service",
    shape: "filled",
    tone: "ok",
    frame: "border-ok/40",
  },
  external: {
    text: "external",
    shape: "filled",
    tone: "ok",
    frame: "border-ok/40",
  },
  starting: {
    text: "starting",
    shape: "breathing",
    tone: "warn",
    frame: "border-warn/40",
  },
  failed: {
    text: "failed",
    shape: "struck",
    tone: "danger",
    frame: "border-danger/40",
  },
  down: {
    text: "down",
    shape: "struck",
    tone: "danger",
    frame: "border-danger/40",
  },
  stopped: {
    text: "stopped",
    shape: "empty",
    tone: "neutral",
    frame: "border-line-strong",
  },
};

export function StatusPill({ state }: { state: ProjectState }) {
  const look = APPEARANCE[state] ?? APPEARANCE.stopped;

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-1.5 py-0.5 font-data text-[10px] text-ink-2 ${look.frame}`}
      data-state={state}
    >
      <StatusDot shape={look.shape} size={9} tone={look.tone} />
      {look.text}
    </span>
  );
}
