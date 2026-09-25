import { useTranslations } from "@renderer/i18n/use-translations";
import { Callout } from "../ui/callout";

/** The vault empties once secrets are sent, so a replay must ask for them again. */
export function OnboardingReplayNotice({ moduleName }: { moduleName: string }) {
  const t = useTranslations();

  return (
    <Callout tone="info">
      {t("onboarding.replay.notice", { name: moduleName })}
    </Callout>
  );
}
