import type { McpClientState } from "@pupitre/shared/desktop-mcp";
import { ClaudeIcon, CodexIcon } from "@renderer/components/ui/agent-icons";
import {
  StatusDot,
  type StatusShape,
  type StatusTone,
} from "@renderer/components/ui/status-dot";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";

type ClientState = "absent" | "problem" | "connected" | "left" | "off";

const LOOK: Record<
  ClientState,
  { shape: StatusShape; tone: StatusTone; label: DictionaryKey }
> = {
  absent: {
    label: "settings.agents.state.absent",
    shape: "struck",
    tone: "neutral",
  },
  connected: {
    label: "settings.agents.state.connected",
    shape: "filled",
    tone: "ok",
  },
  left: { label: "settings.agents.state.left", shape: "ringed", tone: "warn" },
  off: { label: "settings.agents.state.off", shape: "empty", tone: "neutral" },
  problem: {
    label: "settings.agents.state.off",
    shape: "filled",
    tone: "danger",
  },
};

function stateOf(client: McpClientState, enabled: boolean): ClientState {
  if (!client.found) {
    return "absent";
  }

  if (client.problem) {
    return "problem";
  }

  if (client.declared.length === 0) {
    return "off";
  }

  return enabled ? "connected" : "left";
}

export function SettingsAgentsClient({
  client,
  enabled,
}: {
  client: McpClientState;
  enabled: boolean;
}) {
  const t = useTranslations();

  const state = stateOf(client, enabled);
  const look = LOOK[state];
  const Icon = client.id === "codex" ? CodexIcon : ClaudeIcon;
  const effect =
    client.id === "claude-desktop"
      ? "settings.agents.effect.relaunch"
      : "settings.agents.effect.session";

  return (
    <div
      className="flex items-start gap-3 px-5 py-3.5"
      data-agent-client={client.id}
      data-state={state}
    >
      <Icon className="mt-0.5 shrink-0 text-ink-2" size={16} />

      <div className="min-w-0 flex-1">
        <div className="text-control text-ink">
          {t(`settings.agents.client.${client.id}`)}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-ink-2 text-small">
          <StatusDot shape={look.shape} size={9} tone={look.tone} />
          <span className="min-w-0 break-words">
            {client.problem ?? t(look.label)}
          </span>
        </div>

        {client.declared.length > 0 ? (
          <div className="mt-1 break-words font-data text-ink-3 text-small">
            {client.declared.join(", ")}
          </div>
        ) : null}

        {state === "connected" ? (
          <div className="mt-1 text-ink-3 text-small">{t(effect)}</div>
        ) : null}
      </div>
    </div>
  );
}
