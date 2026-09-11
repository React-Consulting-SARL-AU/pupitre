import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ChannelState } from "@renderer/stores/channel";
import type { AgentError } from "@shared/agent";
import { RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";

/**
 * Why nothing on the screen is moving, said above it.
 *
 * A link that dropped comes back on its own, and a dashboard whose last read
 * failed still shows the machine as it was: both are true, and both have to be
 * said, or a dead server keeps looking like a healthy one.
 */
export function ServerLinkNotice({
  channel,
  stale,
  serverName,
  onRetry,
}: {
  channel: ChannelState;
  /** The read that failed while an earlier snapshot stays on screen. */
  stale: AgentError | null;
  serverName?: string;
  onRetry: () => Promise<void>;
}) {
  const t = useTranslations();

  const name = serverName ?? t("onboarding.thisServer");

  if (channel === "lost") {
    return (
      <div className="clickable shrink-0 px-4 pt-2">
        <Callout fix={t("onboarding.channel.retrying")} name="link" tone="warn">
          {t("onboarding.channel.lost", { name })}
        </Callout>
      </div>
    );
  }

  if (!stale) {
    return null;
  }

  const said = agentText(t, stale);

  return (
    <div className="clickable shrink-0 px-4 pt-2">
      <Callout
        action={
          <Button
            icon={RefreshCw}
            onClick={onRetry}
            size="sm"
            variant="discreet"
          >
            {t("shell.stale.retry")}
          </Button>
        }
        fix={said.fix ?? said.message}
        name="stale"
        tone="warn"
      >
        {t("shell.stale.message", { name })}
      </Callout>
    </div>
  );
}
