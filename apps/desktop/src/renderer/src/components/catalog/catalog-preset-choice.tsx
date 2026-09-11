import type { Manifest, Preset } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CircleSlash } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { RadioDot } from "../ui/radio-dot";
import { ServiceLogo } from "../ui/service-logo";

/** The value of the radio that stands for taking none of them. */
const NONE = "";

/**
 * The one question a preset cannot answer for you.
 *
 * `choose_one` names modules that refuse to stand together — the ways of
 * exposing a machine, the agents. A preset that carried one of them would be
 * choosing for the client; a preset that carried none would leave a hole. So it
 * asks, in the names the agent gave, and among those this machine can still
 * take: what is already installed, or what the architecture refuses, is not a
 * question.
 *
 * Taking none of them is one of the answers, not a way out of the dialog:
 * exposing nothing is a state the product supports, and cancelling would drop
 * the whole preset instead.
 */
export function CatalogPresetChoice({
  preset,
  choices,
  onChoose,
  onCancel,
}: {
  preset: Preset;
  /** The exclusive modules still open here, resolved against the machine. */
  choices: readonly Manifest[];
  onChoose: (moduleId: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const [chosen, setChosen] = useState(choices[0]?.id ?? NONE);

  return (
    <fieldset
      className="elevation-raised flex flex-col gap-3 rounded-md border border-line bg-surface p-4"
      data-preset-choice={preset.id}
    >
      <legend className="label px-1 text-ink-3">
        {t("catalog.presets.chooseOne", { preset: preset.name })}
      </legend>

      <div className="flex flex-col gap-2">
        {choices.map((module) => (
          // biome-ignore lint/a11y/noLabelWithoutControl: the radio is inside RadioDot, and wrapping it is what makes the whole row clickable
          <label
            className="clickable flex items-center gap-3 rounded-md px-2 py-1.5 transition-fast hover:bg-raised"
            data-preset-option={module.id}
            key={module.id}
          >
            <RadioDot
              checked={chosen === module.id}
              label={module.name}
              name={`preset-${preset.id}`}
              onChange={() => setChosen(module.id)}
              value={module.id}
            />
            <ServiceLogo moduleId={module.id} name={module.name} size={20} />
            <span className="min-w-0">
              <span className="block text-ink">{module.name}</span>
              <span className="block text-[12px] text-ink-3">
                {module.summary}
              </span>
            </span>
          </label>
        ))}

        {/** biome-ignore lint/a11y/noLabelWithoutControl: the radio is inside RadioDot, and wrapping it is what makes the whole row clickable */}
        <label
          className="clickable flex items-center gap-3 rounded-md px-2 py-1.5 transition-fast hover:bg-raised"
          data-preset-option="none"
        >
          <RadioDot
            checked={chosen === NONE}
            label={t("catalog.presets.none")}
            name={`preset-${preset.id}`}
            onChange={() => setChosen(NONE)}
            value={NONE}
          />
          <CircleSlash
            aria-hidden="true"
            className="shrink-0 text-ink-4"
            size={20}
            strokeWidth={1.5}
          />
          <span className="min-w-0">
            <span className="block text-ink">{t("catalog.presets.none")}</span>
            <span className="block text-[12px] text-ink-3">
              {t("catalog.presets.noneDetail")}
            </span>
          </span>
        </label>
      </div>

      <div className="flex gap-2">
        <Button onClick={() => onChoose(chosen)} size="sm" variant="inverse">
          {t("catalog.presets.apply")}
        </Button>
        <Button onClick={onCancel} size="sm" variant="discreet">
          {t("common.cancel")}
        </Button>
      </div>
    </fieldset>
  );
}
