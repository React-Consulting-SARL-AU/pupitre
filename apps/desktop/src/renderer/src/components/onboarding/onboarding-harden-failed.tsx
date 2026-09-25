import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { StepFailure } from "../ui/step-failure";

export function OnboardingHardenFailed({
  error,
  onRetry,
}: {
  error: AgentError;
  onRetry: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-col gap-gutter" data-harden="failed">
      <StepFailure error={error} onRetry={onRetry} />

      <p className="text-ink-3 leading-relaxed">
        {t("onboarding.harden.failedOpen")}
      </p>
    </div>
  );
}
