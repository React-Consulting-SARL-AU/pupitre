import { useTranslations } from "@renderer/i18n/use-translations";
import { accountOf, useAccount } from "@renderer/stores/account";
import { useChannel } from "@renderer/stores/channel";
import { Callout } from "../ui/callout";

/**
 * What holds the whole sequence rather than one of its steps.
 *
 * A link that dropped and a usage right the platform stopped confirming are not
 * failures of the step the reader is on: the step stands where it is, reading
 * goes on, and this says why nothing is moving. Both come back on their own;
 * the onboarding store is what holds and releases the step, this only says so.
 */
export function OnboardingBanner({
  serverId,
  serverName,
}: {
  serverId: string | null;
  serverName?: string;
}) {
  const t = useTranslations();

  const channel = useChannel((store) => store.stateOf(serverId));
  const refusal = useAccount((store) => accountOf(store.view)?.refusal ?? null);

  if (refusal) {
    return (
      <Callout fix={refusal.fix} tone="warn">
        {t("onboarding.usage.held")}
      </Callout>
    );
  }

  if (channel === "lost") {
    return (
      <Callout fix={t("onboarding.channel.retrying")} tone="warn">
        {t("onboarding.channel.lost", {
          name: serverName ?? t("onboarding.thisServer"),
        })}
      </Callout>
    );
  }

  return null;
}
