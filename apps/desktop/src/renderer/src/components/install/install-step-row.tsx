import { humanMs } from "../../lib/duration";
import type { StepEntry } from "../../stores/install";
import { StatusDot } from "../ui/status-dot";
import { STEP_LOOK } from "./install-status";

/**
 * One step of one module: what it is, how it went, how long it took.
 *
 * A step still running shows no duration — the number the agent sends with a
 * `start` is zero, and printing it would say the step took no time rather than
 * that it has not finished.
 */
export function InstallStepRow({ step }: { step: StepEntry }) {
  const look = STEP_LOOK[step.status];

  return (
    <li
      className="flex items-baseline gap-2 py-1.5 pl-1"
      data-status={step.status}
      data-step={step.step}
    >
      <span className="translate-y-px">
        <StatusDot
          label={`${step.step} — ${look.label}`}
          shape={look.shape}
          size={9}
          tone={look.tone}
        />
      </span>

      <span className="min-w-0 flex-1 truncate font-data text-[11px] text-ink-2">
        {step.step}
      </span>

      {step.status === "start" ? null : (
        <span className="shrink-0 font-data text-[11px] text-ink-3 tabular-nums">
          {humanMs(step.ms)}
        </span>
      )}
    </li>
  );
}
