import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentState } from "@shared/terminals";
import { StatusDot, type StatusShape, type StatusTone } from "./status-dot";

// Only "working" and "attention" catch the eye; the other states stay deliberately dull.
const APPEARANCE: Record<
  AgentState,
  { shape: StatusShape; tone: StatusTone; title: DictionaryKey }
> = {
  working: { shape: "breathing", title: "ui.agent.working", tone: "neutral" },
  attention: {
    shape: "ringed",
    title: "ui.agent.attention",
    tone: "warn",
  },
  idle: { shape: "filled", title: "ui.agent.idle", tone: "neutral" },
  asleep: {
    shape: "empty",
    title: "ui.agent.asleep",
    tone: "neutral",
  },
  finished: { shape: "struck", title: "ui.agent.finished", tone: "neutral" },
};

export function agentStateLabel(state: AgentState): DictionaryKey {
  return APPEARANCE[state].title;
}

export function AgentDot({
  state,
  size = 9,
}: {
  state: AgentState | null | undefined;
  size?: number;
}) {
  const t = useTranslations();

  if (!state) {
    return null;
  }

  const { shape, tone, title } = APPEARANCE[state];

  return <StatusDot label={t(title)} shape={shape} size={size} tone={tone} />;
}
