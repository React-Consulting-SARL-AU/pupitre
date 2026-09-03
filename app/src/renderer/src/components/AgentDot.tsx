import type { AgentState } from "@shared/contract";

/**
 * What a session is doing, in one dot.
 *
 * Only two states should catch the eye: "working", which moves, and "attention",
 * which does not move but carries a halo. The other three are deliberately dull
 * — they say there is nothing to do.
 */
const APPEARANCE: Record<AgentState, { className: string; title: string }> = {
  working: {
    className: "bg-accent animate-[breathe_1.5s_ease-in-out_infinite]",
    title: "working",
  },
  attention: {
    className: "bg-warn ring-[3px] ring-warn/25",
    title: "waiting for your answer",
  },
  idle: { className: "bg-line-strong", title: "idle" },
  asleep: {
    className: "border border-line-strong bg-transparent",
    title: "idle for a while",
  },
  finished: { className: "bg-ink-4/50", title: "session ended" },
};

export function AgentDot({
  state,
  size = 6,
}: {
  state: AgentState | null | undefined;
  size?: number;
}) {
  if (!state) {
    return null;
  }
  const { className, title } = APPEARANCE[state];

  return (
    <span
      aria-label={title}
      className={`inline-block shrink-0 rounded-full ${className}`}
      role="img"
      style={{ height: size, width: size }}
      title={title}
    />
  );
}
