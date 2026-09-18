import { Callout } from "@renderer/components/ui/callout";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since } from "@renderer/lib/format";
import type { ConnectionHealth } from "@renderer/stores/connections";

/**
 * What the provider answered when asked again about a held token.
 *
 * A token revoked upstream reads here, in the provider's own words, rather
 * than as a failed install three screens later. A provider that cannot be
 * asked says so instead of pretending to have checked.
 */
export function ConnectionHealthLine({ health }: { health: ConnectionHealth }) {
  const t = useTranslations();

  if (health.status === "checking") {
    return (
      <p className="flex items-center gap-2 font-data text-[12px] text-ink-3">
        <StatusDot shape="breathing" size={10} />
        {t("connections.health.checking")}
      </p>
    );
  }

  if (health.status === "unaskable") {
    return (
      <p className="text-[12px] text-ink-3 leading-relaxed">
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
      className="flex items-center gap-2 font-data text-[12px] text-ink-3"
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
