import { useTranslations } from "@renderer/i18n/use-translations";
import { Callout } from "../ui/callout";

/**
 * Why a replay stops here instead of running.
 *
 * The vault was emptied the moment the secrets left for the server, so the app
 * has nothing left to send. Saying it plainly is the point: a module reinstalled
 * with an empty password would look like a success.
 */
export function OnboardingReplayNotice({ moduleName }: { moduleName: string }) {
  const t = useTranslations();

  return (
    <Callout tone="info">
      {t("onboarding.replay.notice", { name: moduleName })}
    </Callout>
  );
}
