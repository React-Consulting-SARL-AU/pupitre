import { Logo } from "@renderer/components/logo";
import { Label } from "@renderer/components/ui/label";
import { WindowBand } from "@renderer/components/ui/window-band";
import { useTranslations } from "@renderer/i18n/use-translations";
import type {
  OnboardingStep,
  ServerStage,
} from "../../stores/onboarding-machine";
import { OnboardingProgress } from "./onboarding-progress";

/**
 * The side of the assistant that answers "where am I, and on what machine".
 *
 * It holds no control: the way on and the way back live with the step, which is
 * the only screen that knows whether going on is allowed. Below the split it
 * gives way to the step itself — a narrow window owes the reader the work.
 */
export function OnboardingRail({
  step,
  steps,
  stage,
  serverName,
}: {
  step: OnboardingStep;
  /** The steps this sequence walks: the count and the rail both read from it. */
  steps: readonly OnboardingStep[];
  /** Where the first step is within itself: choosing, adding, or laying the key. */
  stage?: ServerStage;
  serverName?: string;
}) {
  const t = useTranslations();

  const here = steps.indexOf(step);

  return (
    <aside className="hidden flex-col overflow-y-auto border-line border-r bg-surface px-6 pt-2 pb-6 md:flex">
      <WindowBand />

      <div className="mt-6 flex items-center gap-2.5">
        <Logo size={22} />
        <p className="min-w-0 truncate font-medium text-ink">
          {serverName ?? t("onboarding.thisServer")}
        </p>
      </div>

      <div className="mt-10">
        <OnboardingProgress stage={stage} step={step} steps={steps} />
      </div>

      <div className="mt-auto pt-8">
        <Label>{t("onboarding.flow.progress")}</Label>
        <p className="mt-1 font-data text-[12px] text-ink-3 tabular-nums">
          {t("onboarding.flow.stepCount", {
            index: here + 1,
            total: steps.length,
          })}
        </p>
      </div>
    </aside>
  );
}
