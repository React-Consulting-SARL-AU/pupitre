import type { Manifest, Preset } from "@pupitre/shared/catalog";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CircleSlash } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Panel } from "../ui/panel";
import { RadioGroup, RadioLine } from "../ui/radio";
import { ServiceLogo } from "../ui/service-logo";

// "None" is an answer, not a cancel: cancelling drops the whole preset.
const NONE = "";

export function CatalogPresetChoice({
  preset,
  choices,
  onChoose,
  onCancel,
}: {
  preset: Preset;
  choices: readonly Manifest[];
  onChoose: (moduleId: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const [chosen, setChosen] = useState(choices[0]?.id ?? NONE);

  return (
    <Panel className="flex flex-col gap-4" data-preset-choice={preset.id}>
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
    </Panel>
  );
}
