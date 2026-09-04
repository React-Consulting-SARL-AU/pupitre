import type { AgentState } from "@shared/contract";
import { StatusDot, type StatusShape, type StatusTone } from "./ui/status-dot";

/**
 * What a session is doing, in one dot.
 *
 * Only two states should catch the eye: "working", which breathes, and
 * "attention", which does not move but wears a ring. The other three are
 * deliberately dull — they say there is nothing to do.
 */
const APPEARANCE: Record<
  AgentState,
  { shape: StatusShape; tone: StatusTone; title: string }
> = {
  working: { shape: "breathing", tone: "neutral", title: "working" },
  attention: {
    shape: "ringed",
    tone: "warn",
    title: "waiting for your answer",
  },
  idle: { shape: "filled", tone: "neutral", title: "idle" },
  asleep: { shape: "empty", tone: "neutral", title: "idle for a while" },
  finished: { shape: "struck", tone: "neutral", title: "session ended" },
};

export function AgentDot({
  state,
  size = 9,
}: {
  state: AgentState | null | undefined;
  size?: number;
}) {
  if (!state) {
    return null;
  }
  const { shape, tone, title } = APPEARANCE[state];

  return <StatusDot label={title} shape={shape} size={size} tone={tone} />;
}
