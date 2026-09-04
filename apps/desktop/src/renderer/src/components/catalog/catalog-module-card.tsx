import type { Manifest } from "@pupitre/shared/catalog";
import { CheckBox } from "../ui/check-box";
import { ServiceLogo } from "../ui/service-logo";

/**
 * One module, as its manifest describes it.
 *
 * Name, summary and figures are the agent's words; the app adds the logo, the
 * shape of the checkbox and — when something stands in the way — the reason,
 * printed under the summary rather than hidden in a tooltip.
 */
export function CatalogModuleCard({
  module,
  selected,
  reason,
  onToggle,
}: {
  module: Manifest;
  selected: boolean;
  /** Why it cannot be chosen right now, if it cannot. */
  reason?: string;
  onToggle?: (moduleId: string) => void;
}) {
  const locked = module.mandatory;
  const unreachable = Boolean(reason) && !selected;

  return (
    <li
      className={`elevation-raised flex gap-3 rounded-md border bg-surface p-3 transition-soft ${
        selected ? "border-line-strong" : "border-line"
      } ${unreachable ? "opacity-55" : ""}`}
      data-blocked={unreachable ? "true" : "false"}
      data-locked={locked ? "true" : "false"}
      data-module={module.id}
      data-selected={selected ? "true" : "false"}
    >
      {/** biome-ignore lint/a11y/noLabelWithoutControl: the control is inside CheckBox, and wrapping it is what makes the whole card clickable */}
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <span className="pt-0.5">
          <CheckBox
            checked={selected}
            disabled={unreachable}
            label={module.name}
            locked={locked}
            name={module.id}
            onChange={() => onToggle?.(module.id)}
          />
        </span>

        <ServiceLogo moduleId={module.id} name={module.name} size={20} />

        <span className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-baseline gap-2">
            <span className="font-medium text-ink">{module.name}</span>
            <code className="font-data text-[10.5px] text-ink-4">
              {module.id}
            </code>
          </span>

          <span className="text-[11px] text-ink-3 leading-relaxed">
            {module.summary}
          </span>

          {reason ? (
            <span className="text-[11px] text-warn leading-relaxed">
              {reason}
            </span>
          ) : null}

          <span className="flex gap-3 font-data text-[10.5px] text-ink-4 tabular-nums">
            <span>{module.resources.ram_mb} Mo de mémoire</span>
            <span>{module.resources.disk_mb} Mo de disque</span>
          </span>
        </span>
      </label>
    </li>
  );
}
