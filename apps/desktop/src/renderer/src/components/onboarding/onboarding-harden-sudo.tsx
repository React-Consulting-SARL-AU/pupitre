import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { SudoOutcome } from "@shared/sudo";
import { RefreshCw } from "lucide-react";
import { ServerSudoFact } from "../servers/server-sudo-fact";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { FactList } from "../ui/fact";
import { Panel } from "../ui/panel";

export function OnboardingHardenSudo({
  serverId,
  sudo,
  onRetry,
}: {
  serverId: string;
  sudo: SudoOutcome;
  onRetry?: () => void;
}) {
  const t = useTranslations();

  if (!sudo.ok) {
    const { message, fix } = agentText(t, sudo.error);

    return (
      <Callout
        action={
          <Button icon={RefreshCw} onClick={onRetry}>
            {t("common.retry")}
          </Button>
        }
        fix={fix}
        name="sudo-password"
        tone="danger"
      >
        {message}
      </Callout>
    );
  }

  return (
    <Panel className="flex flex-col gap-4" data-sudo-outcome="set">
      <div>
        <p className="font-medium text-ink">{t("sudo.outcome.title")}</p>
        <p className="mt-1 text-ink-3 leading-relaxed">
          {t("sudo.outcome.detail")}
        </p>
      </div>

      <FactList>
        <ServerSudoFact serverId={serverId} />
      </FactList>

      {sudo.kept ? null : (
        <Callout bare name="sudo-unkept" tone="warn">
          {t("sudo.outcome.unkept")}
        </Callout>
      )}
    </Panel>
  );
}
