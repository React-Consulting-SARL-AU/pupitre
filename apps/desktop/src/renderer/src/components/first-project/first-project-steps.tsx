import type { Phase } from "../../stores/first-project";
import { StatusDot } from "../ui/status-dot";
import { PHASE_DOING, PHASE_LOOK, PHASE_TITLES } from "./first-project-phases";

/**
 * The five phases, and where the project got to.
 *
 * A running phase says what the agent is doing rather than that something is
 * happening; a finished one keeps the detail the agent gave — the folder, the
 * port, the address.
 */
export function FirstProjectSteps({ phases }: { phases: readonly Phase[] }) {
  return (
    <ol className="flex flex-col rounded-md border border-line bg-surface">
      {phases.map((phase, index) => {
        const look = PHASE_LOOK[phase.status];
        const detail =
          phase.status === "running" ? PHASE_DOING[phase.id] : phase.detail;

        return (
          <li
            className={`flex items-start gap-3 px-4 py-3 ${index > 0 ? "border-line border-t" : ""}`}
            data-phase={phase.id}
            data-status={phase.status}
            key={phase.id}
          >
            <span className="translate-y-1">
              <StatusDot
                label={look.label}
                shape={look.shape}
                tone={look.tone}
              />
            </span>

            <div className="min-w-0 flex-1">
              <p
                className={
                  phase.status === "pending" ? "text-ink-3" : "text-ink"
                }
              >
                {PHASE_TITLES[phase.id]}
              </p>
              {detail ? (
                <p className="mt-0.5 font-data text-[11px] text-ink-3 leading-relaxed">
                  {detail}
                </p>
              ) : null}
            </div>

            <span className="label shrink-0 translate-y-0.5 text-ink-4">
              {look.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
