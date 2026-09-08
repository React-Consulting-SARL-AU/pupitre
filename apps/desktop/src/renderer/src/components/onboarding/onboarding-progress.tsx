import { useTranslations } from "@renderer/i18n/use-translations";
import {
  ONBOARDING_STEPS,
  type OnboardingStep,
  SERVER_STAGES,
  type ServerStage,
} from "../../stores/onboarding-machine";
import { StatusDot } from "../ui/status-dot";

/**
 * Where the onboarding is, in the order it happens.
 *
 * The shape carries it: a done step is a full dot, the current one breathes,
 * what is still ahead is a hollow circle. The segment between two dots darkens
 * as the rail is walked, so the progress reads as one line rather than nine
 * marks, and it reads in pure greys.
 */
export function OnboardingProgress({
  step,
  stage,
}: {
  step: OnboardingStep;
  /** The sub-steps of the first one, shown in place rather than left implicit. */
  stage?: ServerStage;
}) {
  const t = useTranslations();

  const here = ONBOARDING_STEPS.indexOf(step);
  const last = ONBOARDING_STEPS.length - 1;

  return (
    <ol className="flex flex-col">
      {ONBOARDING_STEPS.map((candidate, index) => {
        const done = index < here;
        const current = index === here;

        let shape: "filled" | "breathing" | "empty" = "empty";
        if (done) {
          shape = "filled";
        } else if (current) {
          shape = "breathing";
        }

        // Done and ahead are told apart by the dot and by the line that darkens
        // behind it, never by an ink too faint to read: a step's name is the one
        // thing the shape cannot say.
        const tone = current ? "text-ink" : "text-ink-3";

        return (
          <li
            aria-current={current ? "step" : undefined}
            className="flex gap-3"
            data-step={candidate}
            key={candidate}
          >
            <div className="flex flex-col items-center self-stretch pt-1.5">
              <StatusDot shape={shape} size={11} />
              {index === last ? null : (
                <span
                  className={`w-px flex-1 transition-soft ${done ? "bg-ink-3" : "bg-line"}`}
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
                      className={`text-[12px] ${
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
