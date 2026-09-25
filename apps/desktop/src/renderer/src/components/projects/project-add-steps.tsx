import { useTranslations } from "@renderer/i18n/use-translations";
import type { Phase } from "../../stores/project-add";
import { LiveDuration } from "../ui/live-duration";
import { Panel } from "../ui/panel";
import { StatusDot } from "../ui/status-dot";
import { PHASE_LOOK, PHASE_TITLES } from "./project-add-phases";

/**
 * The phases, and where the project got to: a finished one keeps the detail
 * the agent gave — the folder, the port, the address. The one at work counts
 * its wait: a clone and an install can hold a phase for minutes, and a screen
 * that does not move over that time reads as a screen that stopped.
 */
export function ProjectAddSteps({ phases }: { phases: readonly Phase[] }) {
  const t = useTranslations();

  return (
    <Panel as="ol" className="flex flex-col overflow-hidden" inset="none">
      {phases.map((phase, index) => {
        const look = PHASE_LOOK[phase.status];

        return (
          <li
            className={`flex items-start gap-3 px-4 py-3 ${index > 0 ? "border-line border-t" : ""}`}
            data-phase={phase.id}
            data-status={phase.status}
            key={phase.id}
          >
            <span className="flex h-lh items-center">
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
                <p className="mt-0.5 font-data text-ink-3 text-small leading-relaxed">
                  {phase.detail}
                </p>
              ) : null}
              {phase.warnings?.map((warning) => (
                <p
                  className="mt-1 text-small text-warn leading-relaxed"
                  data-warning=""
                  key={warning}
                >
                  {t("projectAdd.phase.warning", { warning })}
                </p>
              ))}
            </div>

            <span className="flex shrink-0 translate-y-0.5 items-baseline gap-2 text-ink-3">
              {phase.status === "running" ? (
                <LiveDuration className="font-data text-small tabular-nums" />
              ) : null}
              <span className="label">{t(look.label)}</span>
            </span>
          </li>
        );
      })}
    </Panel>
  );
}
