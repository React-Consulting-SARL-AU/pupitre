import { Callout } from "@renderer/components/ui/callout";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import type { ConnectionHealth } from "@renderer/stores/connections";

export function ConnectionHealthLine({ health }: { health: ConnectionHealth }) {
  const t = useTranslations();

  if (health.status === "checking") {
    return (
      <p className="flex items-center gap-2 font-data text-ink-3 text-small">
        <StatusDot shape="breathing" size={10} />
        {t("connections.health.checking")}
      </p>
    );
  }

  if (health.status === "unaskable") {
    return (
      <p className="text-ink-3 text-small leading-relaxed">
        {t("connections.health.unaskable")}
      </p>
    );
  }

  if (health.status === "refused") {
    return (
      <Callout bare fix={agentText(t, health.error).fix} tone="danger">
        {agentText(t, health.error).message}
      </Callout>
    );
  }

  return (
    <p
      className="flex items-center gap-2 font-data text-ink-3 text-small"
      data-health="answered"
    >
      <StatusDot shape="filled" size={10} tone="ok" />
      {t("connections.health.answered", {
        account: health.account,
        when: since(health.at),
      })}
    </p>
  );
}
