import { useTranslations } from "@renderer/i18n/use-translations";
import { humanMs } from "../../lib/duration";
import type { StepEntry } from "../../stores/install";
import { LiveDuration } from "../ui/live-duration";
import { StatusDot } from "../ui/status-dot";
import { STEP_LOOK, WARNED_STEP } from "./install-status";

/**
 * One step of one module: what it is, how it went, how long it took.
 *
 * A step still running counts the wait as it goes — the number the agent
 * sends with a `start` is zero, and printing it would say the step took no
 * time rather than that it has not finished. A step with something to say —
 * why it failed, or the warning it went through with — shows it under its
 * name, in the agent's words.
 */
export function InstallStepRow({ step }: { step: StepEntry }) {
  const t = useTranslations();

  const failed = step.status === "fail";
  const warned = !failed && Boolean(step.message);
  const look = warned ? WARNED_STEP : STEP_LOOK[step.status];
  const duration = "shrink-0 font-data text-[12px] text-ink-3 tabular-nums";

  return (
    <li
      className="flex items-center gap-2 py-1.5 pl-1"
      data-status={step.status}
      data-step={step.step}
    >
      <StatusDot
        label={`${step.step} — ${t(look.label)}`}
        shape={look.shape}
        size={9}
        tone={look.tone}
      />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-data text-[12px] text-ink-2">
          {step.step}
        </span>
        {step.message ? (
          <span
            className={`text-[12px] leading-relaxed ${failed ? "font-data text-danger" : "text-warn"}`}
            data-step-message={failed ? "fail" : "warn"}
          >
            {step.message}
          </span>
        ) : null}
      </span>

      {step.status === "start" ? (
        <LiveDuration className={duration} />
      ) : (
        <span className={duration}>{humanMs(step.ms)}</span>
      )}
    </li>
  );
}
