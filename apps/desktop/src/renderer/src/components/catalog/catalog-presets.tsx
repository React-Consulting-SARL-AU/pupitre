import type { Manifest, Preset } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Layers } from "lucide-react";
import { useState } from "react";
import { Label } from "../ui/label";
import { CatalogPresetChoice } from "./catalog-preset-choice";

/**
 * The shortcuts, ahead of the twenty-odd modules.
 *
 * A preset says what it brings by name, not by count: the reader picks between
 * « Node.js, MySQL, Claude Code » and « everything », not between 7 and 23.
 * A preset that carries `choose_one` names modules that contradict each other —
 * the three exposures, the agents — and asks which one before it is applied.
 * Applying it silently would either install none of them or install two that
 * refuse to stand together.
 */
export function CatalogPresets({
  presets,
  modules,
  onPick,
}: {
  presets: readonly Preset[];
  /** The catalogue, so a choice shows the names the agent gave rather than ids. */
  modules: readonly Manifest[];
  onPick?: (presetId: string, chosen?: string) => void;
}) {
  const t = useTranslations();

  const [asking, setAsking] = useState<Preset | null>(null);

  if (presets.length === 0) {
    return null;
  }

  function pick(preset: Preset): void {
    if (preset.choose_one && preset.choose_one.length > 0) {
      setAsking(preset);

      return;
    }

    onPick?.(preset.id);
  }

  /** What the preset adds to the core, in the catalogue's own words. */
  function brings(preset: Preset): string {
    const names = preset.modules
      .map((id) => modules.find((module) => module.id === id))
      .filter((module) => module && !module.mandatory)
      .map((module) => (module as Manifest).name);

    return names.length > 0
      ? t("catalog.presets.includes", { names: names.join(", ") })
      : t.plural("catalog.presets.modules", preset.modules.length);
  }

  return (
    <section className="flex flex-col gap-3">
      <Label>{t("catalog.presets.title")}</Label>

      <div className="grid gap-gutter sm:grid-cols-3">
        {presets.map((preset) => (
          <button
            className="clickable elevation-raised flex flex-col items-start gap-1 rounded-md border border-line bg-surface px-4 py-3 text-left transition-soft hover:border-line-strong"
            data-preset={preset.id}
            key={preset.id}
            onClick={() => pick(preset)}
            type="button"
          >
            <span className="flex items-center gap-2 font-medium text-ink">
              <Layers className="text-ink-3" size={13} strokeWidth={1.5} />
              {preset.name}
            </span>
            <span className="text-[12px] text-ink-3 leading-relaxed">
              {brings(preset)}
            </span>
          </button>
        ))}
      </div>

      {asking ? (
        <CatalogPresetChoice
          modules={modules}
          onCancel={() => setAsking(null)}
          onChoose={(chosen) => {
            onPick?.(asking.id, chosen);
            setAsking(null);
          }}
          preset={asking}
        />
      ) : null}
    </section>
  );
}
