import type { Manifest } from "@pupitre/shared/catalog";
import { CheckBox } from "../ui/check-box";
import { ServiceLogo } from "../ui/service-logo";

export function CatalogModuleCard({
  module,
  selected,
  reason,
  onToggle,
}: {
  module: Manifest;
  selected: boolean;
  reason?: string;
  onToggle?: (moduleId: string) => void;
}) {
  const locked = module.mandatory;
  const unreachable = Boolean(reason) && !selected;

  return (
    <li
      className={`elevation-raised flex gap-3 rounded-md border bg-surface p-4 transition-soft ${
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
          <span className="font-medium text-ink">{module.name}</span>

          <span className="text-ink-3 text-small leading-relaxed">
            {module.summary}
          </span>

          {reason ? (
            <span className="text-small text-warn leading-relaxed">
              {reason}
            </span>
          ) : null}
        </span>
      </label>
    </li>
  );
}
