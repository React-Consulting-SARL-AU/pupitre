import type { Preset } from "@pupitre/shared/catalog";
import { Layers } from "lucide-react";
import { Label } from "../ui/label";

/** The three shortcuts, ahead of the twenty-odd modules. */
export function CatalogPresets({
  presets,
  onPick,
}: {
  presets: readonly Preset[];
  onPick?: (presetId: string) => void;
}) {
  if (presets.length === 0) {
    return null;
  }

  return (
    <section className="flex flex-col gap-3">
      <Label>Pour commencer</Label>

      <div className="grid gap-gutter sm:grid-cols-3">
        {presets.map((preset) => (
          <button
            className="clickable elevation-raised flex flex-col items-start gap-1 rounded-md border border-line bg-surface px-4 py-3 text-left transition-soft hover:border-line-strong"
            data-preset={preset.id}
            key={preset.id}
            onClick={() => onPick?.(preset.id)}
            type="button"
          >
            <span className="flex items-center gap-2 font-medium text-ink">
              <Layers className="text-ink-3" size={13} strokeWidth={1.5} />
              {preset.name}
            </span>
            <span className="font-data text-[11px] text-ink-3 tabular-nums">
              {preset.modules.length} modules
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
