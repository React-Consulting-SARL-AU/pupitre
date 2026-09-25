import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowLeft, ArrowRight, ShieldCheck } from "lucide-react";

export function BackupsSetupFooter({
  stray,
  last,
  busy,
  onBack,
}: {
  stray: readonly string[];
  last: boolean;
  busy: boolean;
  onBack?: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-3 border-line border-t px-6 py-4">
      {stray.length > 0 ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-1" data-config-stray="">
          {stray.map((line) => (
            <li className="text-danger text-small" key={line}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {onBack ? (
          <Button
            disabled={busy}
            icon={ArrowLeft}
            onClick={onBack}
            size="sm"
            variant="discreet"
          >
            {t("backups.setup.back")}
          </Button>
        ) : null}

        <Button
          disabled={busy}
          icon={last ? ShieldCheck : ArrowRight}
          loading={busy}
          size="sm"
          submit
          variant="inverse"
        >
          {t(last ? "backups.setup.activate" : "backups.setup.next")}
        </Button>
      </div>
    </div>
  );
}
