import { useTranslations } from "@renderer/i18n/use-translations";
import {
  type OnboardingStep,
  SERVER_STAGES,
  type ServerStage,
} from "../../stores/onboarding-machine";
import { StatusDot } from "../ui/status-dot";

export function OnboardingProgress({
  step,
  steps,
  stage,
}: {
  step: OnboardingStep;
  steps: readonly OnboardingStep[];
  stage?: ServerStage;
}) {
  const t = useTranslations();

  const here = steps.indexOf(step);
  const last = steps.length - 1;

  return (
    <ol className="flex flex-col">
      {steps.map((candidate, index) => {
        const done = index < here;
        const current = index === here;

        let shape: "filled" | "breathing" | "empty" = "empty";

        if (done) {
          shape = "filled";
        } else if (current) {
          shape = "breathing";
        }

        // Dot and line tell done from ahead; dimming the name further would make it unreadable.
        const tone = current ? "text-ink" : "text-ink-3";

        return (
          <li
            aria-current={current ? "step" : undefined}
            className="flex gap-3"
            data-step={candidate}
            key={candidate}
          >
            {/* Even sizes keep dots and the 2px line on whole pixels, sharing one axis. */}
            <div className="flex flex-col items-center self-stretch pt-1.5">
              <StatusDot shape={shape} size={12} />
              {index === last ? null : (
                <span
                  className={`w-0.5 flex-1 transition-soft ${done ? "bg-ink-3" : "bg-line"}`}
                />
              )}
            </div>

            <div className="flex min-w-0 flex-col pb-4">
              <span
                className={`transition-soft ${current ? "font-medium" : ""} ${tone}`}
                data-current={current ? "true" : undefined}
              >
                {t(`onboarding.step.${candidate}`)}
              </span>

              {candidate === "server" && current && stage ? (
                <ol className="mt-1 flex flex-col gap-0.5">
                  {SERVER_STAGES.map((one) => (
                    <li
                      className={`text-small ${
                        one === stage ? "text-ink-2" : "text-ink-4"
                      }`}
                      data-current={one === stage ? "true" : undefined}
                      data-stage={one}
                      key={one}
                    >
                      {t(`onboarding.stage.${one}`)}
                    </li>
                  ))}
                </ol>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
