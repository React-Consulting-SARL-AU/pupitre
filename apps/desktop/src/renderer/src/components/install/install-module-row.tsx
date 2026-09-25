import { useTranslations } from "@renderer/i18n/use-translations";
import { humanMs } from "../../lib/duration";
import { stepLabel } from "../../lib/step-label";
import type { ModuleProgress } from "../../stores/install";
import { Details } from "../ui/details";
import { LiveDuration } from "../ui/live-duration";
import { plateOf, ServiceLogo } from "../ui/service-logo";
import { StatusDot } from "../ui/status-dot";
import {
  MODULE_LOOK,
  MODULE_WORDS,
  type ModuleWording,
} from "./install-status";
import { InstallStepRow } from "./install-step-row";
import { InstallStepWait } from "./install-step-wait";

/**
 * One module of the installation, told the way the reader would tell it.
 *
 * The line says the name, where it stands and how long it took; a module at
 * work names the step it is on, because that is what a wait owes. The steps
 * already crossed are how the agent went about it, and stay under Details, each
 * with the agent's own line when it had one, and the command that would repair
 * the module by hand — untouched, because a rewritten one would send the reader
 * to a machine we imagined rather than the one that failed.
 *
 * The title line is as tall as the logo's plate and centres on it, so the dot,
 * the name and the logo sit level whether or not a step line follows.
 */
const LOGO = 20;

export function InstallModuleRow({
  module,
  name,
  wording = "install",
}: {
  module: ModuleProgress;
  name: string;
  wording?: ModuleWording;
}) {
  const t = useTranslations();

  const look = MODULE_LOOK[module.status];
  const said = t(MODULE_WORDS[wording][module.status] ?? look.label);
  const current = module.steps.find((step) => step.status === "start");
  const crossed = module.steps.filter((step) => step.status !== "start");
  const replay = module.steps.find((step) => step.replay)?.replay;
  const duration = "shrink-0 font-data text-small text-ink-3 tabular-nums";

  return (
    <li
      className="flex gap-3 px-4 py-3"
      data-module={module.id}
      data-status={module.status}
    >
      <ServiceLogo moduleId={module.id} name={name} size={LOGO} />

      <div className="min-w-0 flex-1">
        <div
          className="flex items-center gap-2"
          style={{ minHeight: plateOf(LOGO) }}
        >
          <StatusDot
            label={`${name} — ${said}`}
            shape={look.shape}
            size={10}
            tone={look.tone}
          />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            {name}
          </span>
          <span className="shrink-0 text-ink-3 text-small">{said}</span>
          {module.status === "running" ? (
            <LiveDuration className={duration} />
          ) : null}
          {module.status !== "running" && module.ms > 0 ? (
            <span className={duration}>{humanMs(module.ms)}</span>
          ) : null}
        </div>

        {current ? (
          <p
            className="mt-1 flex items-center gap-2 text-ink-3 text-small"
            data-current-step={current.step}
          >
            <span>{t("install.stepAt", { index: crossed.length + 1 })}</span>
            <span className="min-w-0 flex-1 truncate text-ink-2">
              {stepLabel(t, current.step)}
            </span>
            <LiveDuration className={duration} />
          </p>
        ) : null}

        {current ? <InstallStepWait key={current.step} /> : null}

        {crossed.length > 0 ? (
          <Details className="mt-1">
            <ul className="border-line border-l pl-3">
              {crossed.map((step) => (
                <InstallStepRow
                  key={`${step.step}-${step.status}`}
                  step={step}
                  withId
                />
              ))}
            </ul>
            {replay ? (
              <code className="mt-1 block break-all font-data text-ink-3">
                {replay}
              </code>
            ) : null}
          </Details>
        ) : null}
      </div>
    </li>
  );
}
