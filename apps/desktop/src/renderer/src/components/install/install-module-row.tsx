import { humanMs } from "../../lib/duration";
import type { ModuleProgress } from "../../stores/install";
import { ServiceLogo } from "../ui/service-logo";
import { StatusDot } from "../ui/status-dot";
import { MODULE_LOOK } from "./install-status";
import { InstallStepRow } from "./install-step-row";

/**
 * One module of the installation, with everything the agent said about it.
 *
 * The replay command comes from the `step` event untouched: it is what would
 * repair this module by hand, and rewriting it here would send the reader to a
 * machine we imagined rather than the one that failed.
 */
export function InstallModuleRow({
  module,
  name,
}: {
  module: ModuleProgress;
  name: string;
}) {
  const look = MODULE_LOOK[module.status];
  const replay = module.steps.find((step) => step.replay)?.replay;

  return (
    <li
      className="flex gap-3 px-4 py-3"
      data-module={module.id}
      data-status={module.status}
    >
      <ServiceLogo moduleId={module.id} name={name} size={20} />

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <StatusDot
            label={`${name} — ${look.label}`}
            shape={look.shape}
            size={10}
            tone={look.tone}
          />
          <span className="min-w-0 flex-1 truncate font-medium text-ink">
            {name}
          </span>
          {module.ms > 0 ? (
            <span className="shrink-0 font-data text-[11px] text-ink-3 tabular-nums">
              {humanMs(module.ms)}
            </span>
          ) : null}
        </div>

        {module.steps.length > 0 ? (
          <ul className="mt-1 border-line border-l pl-3">
            {module.steps.map((step) => (
              <InstallStepRow key={`${step.step}-${step.status}`} step={step} />
            ))}
          </ul>
        ) : null}

        {replay ? (
          <code className="mt-1.5 block break-all font-data text-[11px] text-ink-3">
            {replay}
          </code>
        ) : null}
      </div>
    </li>
  );
}
