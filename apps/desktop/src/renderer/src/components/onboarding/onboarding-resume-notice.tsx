import { useTranslations } from "@renderer/i18n/use-translations";
import { Callout } from "../ui/callout";

/**
 * Why a resumed onboarding asks its questions a second time.
 *
 * The machine kept what it was given; the app kept nothing of the secrets, and
 * a module reinstalled with an empty password would look like a success. The
 * modules named here are the ones the probe says the server never received.
 */
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
