import { useTranslations } from "@renderer/i18n/use-translations";
import type { Phase } from "../../stores/project-add";
import { StatusDot } from "../ui/status-dot";
import { PHASE_LOOK, PHASE_TITLES } from "./project-add-phases";

/**
 * The phases, and where the project got to: a finished one keeps the detail
 * the agent gave — the folder, the port, the address.
 */
export function ProjectAddSteps({ phases }: { phases: readonly Phase[] }) {
  const t = useTranslations();

  return (
    <ol className="elevation-raised flex flex-col overflow-hidden rounded-md border border-line bg-surface">
      {phases.map((phase, index) => {
        const look = PHASE_LOOK[phase.status];

        return (
          <li
            className={`flex items-start gap-3 px-4 py-3 ${index > 0 ? "border-line border-t" : ""}`}
            data-phase={phase.id}
            data-status={phase.status}
            key={phase.id}
          >
            <span className="translate-y-1">
              <StatusDot
                label={t(look.label)}
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
                {t(PHASE_TITLES[phase.id])}
              </p>
              {phase.detail ? (
                <p className="mt-0.5 font-data text-[12px] text-ink-3 leading-relaxed">
                  {phase.detail}
                </p>
              ) : null}
            </div>

            <span className="label shrink-0 translate-y-0.5 text-ink-3">
              {t(look.label)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
