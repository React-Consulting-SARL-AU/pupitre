import type { Manifest, Preset } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useState } from "react";
import { Button } from "../ui/button";
import { ServiceLogo } from "../ui/service-logo";

/**
 * The one question a preset cannot answer for you.
 *
 * `choose_one` names modules that refuse to stand together — the three ways of
 * exposing a machine, the three agents. A preset that carried one of them would
 * be choosing for the client; a preset that carried none would leave a hole.
 * So it asks, in the names the agent gave.
 */
export function CatalogPresetChoice({
  preset,
  modules,
  onChoose,
  onCancel,
}: {
  preset: Preset;
  modules: readonly Manifest[];
  onChoose: (moduleId: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const offered = (preset.choose_one ?? []).map(
    (id) => modules.find((one) => one.id === id) ?? null
  );

  const [chosen, setChosen] = useState(preset.choose_one?.[0] ?? "");

  return (
    <fieldset
      className="elevation-raised flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
      data-preset-choice={preset.id}
    >
      <legend className="label px-1 text-ink-3">
        {t("catalog.presets.chooseOne", { preset: preset.name })}
      </legend>

      <div className="flex flex-col gap-2">
        {offered.map((module, index) => {
          const id = preset.choose_one?.[index] ?? "";

          return (
            <label
              className="clickable flex items-center gap-3 rounded-md px-2 py-1.5 transition-fast hover:bg-raised"
              key={id}
            >
              <input
                checked={chosen === id}
                name={`preset-${preset.id}`}
                onChange={() => setChosen(id)}
                type="radio"
                value={id}
              />
              <ServiceLogo moduleId={id} name={module?.name ?? id} size={20} />
              <span className="min-w-0">
                <span className="block text-ink">{module?.name ?? id}</span>
                {module ? (
                  <span className="block text-[12px] text-ink-3">
                    {module.summary}
                  </span>
                ) : null}
              </span>
            </label>
          );
        })}
      </div>

      <div className="flex gap-2">
        <Button
          disabled={chosen === ""}
          onClick={() => onChoose(chosen)}
          size="sm"
          variant="inverse"
        >
          {t("catalog.presets.apply")}
        </Button>
        <Button onClick={onCancel} size="sm" variant="discreet">
          {t("common.cancel")}
        </Button>
      </div>
    </fieldset>
  );
}
