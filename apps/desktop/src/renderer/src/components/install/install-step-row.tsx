import { useTranslations } from "@renderer/i18n/use-translations";
import { humanMs } from "../../lib/duration";
import { stepLabel } from "../../lib/step-label";
import type { StepEntry } from "../../stores/install";
import { LiveDuration } from "../ui/live-duration";
import { StatusDot } from "../ui/status-dot";
import { STEP_LOOK, WARNED_STEP } from "./install-status";

export function InstallStepRow({
  step,
  withId = false,
}: {
  step: StepEntry;
  withId?: boolean;
}) {
  const t = useTranslations();

  const failed = step.status === "fail";
  const warned = !failed && Boolean(step.message);
  const look = warned ? WARNED_STEP : STEP_LOOK[step.status];
  const label = stepLabel(t, step.step);
  const duration = "shrink-0 font-data text-small text-ink-3 tabular-nums";

  return (
    <li
      className="flex items-center gap-2 py-1.5 pl-1"
      data-status={step.status}
      data-step={step.step}
    >
      <StatusDot
        label={`${label} — ${t(look.label)}`}
        shape={look.shape}
        size={9}
        tone={look.tone}
      />

      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex min-w-0 items-center gap-2">
          <span className="truncate text-ink-2 text-small">{label}</span>
          {withId && label !== step.step ? (
            <code className="truncate font-data text-caption text-ink-3">
              {step.step}
            </code>
          ) : null}
        </span>
        {step.message ? (
          <span
            className={`text-small leading-relaxed ${failed ? "font-data text-danger" : "text-warn"}`}
            data-step-message={failed ? "fail" : "warn"}
          >
            {step.message}
          </span>
        ) : null}
      </span>

      {/* The agent sends ms: 0 with a `start`, which would read as "took no time". */}
      {step.status === "start" ? (
        <LiveDuration className={duration} />
      ) : (
        <span className={duration}>{humanMs(step.ms)}</span>
      )}
    </li>
  );
}
