import { useTranslations } from "@renderer/i18n/use-translations";
import { accountOf, useAccount } from "@renderer/stores/account";
import { useChannel } from "@renderer/stores/channel";
import { Callout } from "../ui/callout";

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
