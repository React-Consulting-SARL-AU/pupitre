import { useTranslations } from "@renderer/i18n/use-translations";
import type { SecretMark } from "@shared/secrets";
import { Eye, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { fieldControlClass } from "../ui/field";

/**
 * A secret, on its way out of the app and never back.
 *
 * What is typed here goes to the main process on every keystroke and is not
 * kept in this component, in a store, or in the value of the input. A generated
 * one can be shown exactly once — the button is gone afterwards, and the value
 * lives in this component's own state until the screen closes.
 */
export function ConfigSecretField({
  name,
  label,
  mark,
  required,
  onChange,
  onGenerate,
  onReveal,
}: {
  name: string;
  label: string;
  mark?: SecretMark;
  required: boolean;
  onChange?: (value: string) => void;
  onGenerate?: () => void;
  onReveal?: () => Promise<string | null>;
}) {
  const t = useTranslations();

  const [shown, setShown] = useState<string | null>(null);
  const generated = mark?.generated === true;
  const revealed = mark?.revealed === true;

  async function reveal() {
    setShown((await onReveal?.()) ?? null);
  }

  if (generated) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-data text-[11px] text-ink-3">
            {t("config.secret.generated")}
          </span>

          {revealed ? null : (
            <Button icon={Eye} onClick={reveal} size="sm">
              {t("config.secret.showOnce")}
            </Button>
          )}

          <Button
            icon={RefreshCw}
            onClick={onGenerate}
            size="sm"
            variant="discreet"
          >
            {t("config.secret.regenerate")}
          </Button>
        </div>

        {shown ? (
          <code className="block break-all rounded-sm border border-line-strong bg-sunken px-2.5 py-2 font-data text-[11px] text-ink">
            {shown}
          </code>
        ) : null}

        {revealed && !shown ? (
          <span className="text-[11px] text-ink-4">
            {t("config.secret.shown")}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        aria-label={label}
        autoComplete="off"
        className={fieldControlClass}
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={
          mark?.filled ? t("config.secret.saved") : t("config.secret.paste")
        }
        required={required}
        spellCheck={false}
        type="password"
      />

      {onGenerate ? (
        <div>
          <Button
            icon={RefreshCw}
            onClick={onGenerate}
            size="sm"
            variant="discreet"
          >
            {t("config.secret.generate")}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
