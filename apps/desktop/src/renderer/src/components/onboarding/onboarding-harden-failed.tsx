import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { StepFailure } from "../ui/step-failure";

/**
 * A hardening that stopped — the channel fell, the agent refused — is not a
 * sequence that cannot end: the machine is installed, and the reader may go
 * on with root open. The way back is closed by then; the bar the screen ends
 * on offers that way out, next to the retry here.
 */
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
