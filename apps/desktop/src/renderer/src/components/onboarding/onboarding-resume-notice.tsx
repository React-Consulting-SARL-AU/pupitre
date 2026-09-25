import { useTranslations } from "@renderer/i18n/use-translations";
import { Callout } from "../ui/callout";

/** The app keeps no secret once sent, so a resumed onboarding asks for them again. */
export function OnboardingResumeNotice({
  names,
}: {
  names: readonly string[];
}) {
  const t = useTranslations();

  return (
    <Callout tone="info">
      {t("onboarding.resume.notice", { modules: names.join(", ") })}
    </Callout>
  );
}
