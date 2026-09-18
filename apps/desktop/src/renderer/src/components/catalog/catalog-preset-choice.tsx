import type { Manifest, Preset } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CircleSlash } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { RadioGroup, RadioLine } from "../ui/radio";
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
    <div
      className="elevation-raised flex flex-col gap-4 rounded-md border border-line bg-surface p-5"
      data-preset-choice={preset.id}
    >
      <Label>{t("catalog.presets.chooseOne", { preset: preset.name })}</Label>

      <RadioGroup
        label={t("catalog.presets.chooseOne", { preset: preset.name })}
        name={`preset-${preset.id}`}
        onChange={setChosen}
        value={chosen}
      >
        {choices.map((module) => (
          <RadioLine
            data-preset-option={module.id}
            detail={module.summary}
            key={module.id}
            label={module.name}
            leading={
              <ServiceLogo moduleId={module.id} name={module.name} size={20} />
            }
            value={module.id}
          />
        ))}

        <RadioLine
          data-preset-option="none"
          detail={t("catalog.presets.noneDetail")}
          label={t("catalog.presets.none")}
          leading={
            <CircleSlash
              aria-hidden="true"
              className="shrink-0 text-ink-4"
              size={20}
              strokeWidth={1.5}
            />
          }
          value={NONE}
        />
      </RadioGroup>

      <div className="flex gap-2">
        <Button onClick={() => onChoose(chosen)} size="sm" variant="inverse">
          {t("catalog.presets.apply")}
        </Button>
        <Button onClick={onCancel} size="sm" variant="discreet">
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
