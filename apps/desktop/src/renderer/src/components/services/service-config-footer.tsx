import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { RefreshCw, Undo2 } from "lucide-react";

/**
 * The foot of a module's form: how many values are refused — named when no
 * field above carries them — the way back, and Apply, which has nothing to do
 * until something differs from what the server holds.
 */
export function ServiceConfigFooter({
  refused,
  stray = [],
  running,
  dirty,
  applicable,
  onDiscard,
}: {
  /** How many fields the form or the server refuses. */
  refused: number;
  /** The refusals no field of the form carries, each said with the field it names. */
  stray?: readonly string[];
  running: boolean;
  dirty: boolean;
  /** Apply stands open even with nothing changed: an account to send again, a module to install. */
  applicable: boolean;
  onDiscard?: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-3 border-line border-t px-6 py-4">
      {refused > 0 && stray.length === 0 ? (
        <span className="text-[12px] text-danger" data-config-refused="">
          {t.plural("services.config.refused", refused)}
        </span>
      ) : null}

      {stray.length > 0 ? (
        <ul className="flex min-w-0 flex-1 flex-col gap-1" data-config-stray="">
          {stray.map((line) => (
            <li className="text-[12px] text-danger" key={line}>
              {line}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {dirty && onDiscard ? (
          <Button
            disabled={running}
            icon={Undo2}
            onClick={onDiscard}
            size="sm"
            variant="discreet"
          >
            {t("services.config.discard")}
          </Button>
        ) : null}

        <Button
          disabled={running || !(dirty || applicable)}
          icon={RefreshCw}
          loading={running}
          size="sm"
          submit
          variant="inverse"
        >
          {t("services.config.apply")}
        </Button>
      </div>
    </div>
  );
}
