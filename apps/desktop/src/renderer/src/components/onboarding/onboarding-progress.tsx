import { ONBOARDING_STEPS, type OnboardingStep } from "../../stores/onboarding";
import { StatusDot } from "../ui/status-dot";

const TITLES: Record<OnboardingStep, string> = {
  agent: "Agent",
  catalog: "Catalogue",
  config: "Configuration",
  done: "Prêt",
  harden: "Durcissement",
  install: "Installation",
  inspection: "Inspection",
  project: "Projet",
  server: "Serveur",
};

/**
 * Where the onboarding is, in the order it happens.
 *
 * The shape carries it: a done step is a full dot, the current one breathes,
 * what is still ahead is a hollow circle. The rail reads in pure greys.
 */
export function OnboardingProgress({ step }: { step: OnboardingStep }) {
  const here = ONBOARDING_STEPS.indexOf(step);

  return (
    <ol className="flex flex-wrap items-center gap-x-4 gap-y-2">
      {ONBOARDING_STEPS.map((candidate, index) => {
        const done = index < here;
        const current = index === here;

        let shape: "filled" | "breathing" | "empty" = "empty";
        if (done) {
          shape = "filled";
        } else if (current) {
          shape = "breathing";
        }

        return (
          <li
            aria-current={current ? "step" : undefined}
            className="flex items-center gap-1.5"
            data-step={candidate}
            key={candidate}
          >
            <StatusDot shape={shape} size={9} />
            <span
              className={`text-[10.5px] uppercase tracking-[0.08em] ${current ? "text-ink" : "text-ink-4"}`}
            >
              {TITLES[candidate]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
