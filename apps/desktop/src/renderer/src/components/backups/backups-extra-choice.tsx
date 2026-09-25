import { Button } from "@renderer/components/ui/button";
import { CheckLine } from "@renderer/components/ui/check-line";
import { Panel } from "@renderer/components/ui/panel";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight } from "lucide-react";
import { useState } from "react";

/**
 * The modules this server runs and the backup does not hold: the reader says
 * which go before the data comes back. All are ticked — the backup is the state
 * being returned to.
 */
export function BackupsExtraChoice({
  extra,
  nameOf,
  onSettle,
}: {
  extra: readonly string[];
  nameOf: (moduleId: string) => string;
  onSettle: (uninstall: readonly string[]) => Promise<void>;
}) {
  const t = useTranslations();

  const [chosen, setChosen] = useState<readonly string[]>(extra);

  function toggle(moduleId: string, next: boolean): void {
    setChosen((held) =>
      next ? [...held, moduleId] : held.filter((one) => one !== moduleId)
    );
  }

  return (
    <Panel className="flex flex-col gap-4" inset="lg">
      <p className="text-control text-ink-2">{t("backups.extra.question")}</p>

      <div className="flex flex-col gap-2">
        {extra.map((moduleId) => (
          <CheckLine
            checked={chosen.includes(moduleId)}
            key={moduleId}
            label={nameOf(moduleId)}
            name={`backup-extra-${moduleId}`}
            onChange={(next) => toggle(moduleId, next)}
          />
        ))}
      </div>

      <div className="flex justify-end">
        <Button
          icon={ArrowRight}
          onClick={() => onSettle(chosen)}
          variant="inverse"
        >
          {t.plural("backups.extra.settle", chosen.length)}
        </Button>
      </div>
    </Panel>
  );
}
