import { useTranslations } from "@renderer/i18n/use-translations";
import type { SecretMark } from "@shared/secrets";
import { Eye, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../ui/button";
import { controlClass } from "../ui/field";

export function ConfigSecretField({
  wrong = false,
  name,
  label,
  mark,
  required,
  held = false,
  onChange,
  onGenerate,
  onReveal,
}: {
  name: string;
  label: string;
  mark?: SecretMark;
  required: boolean;
  wrong?: boolean;
  held?: boolean;
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

  function placeholder(): string {
    if (mark?.filled) {
      return t("config.secret.saved");
    }

    return held ? t("config.secret.kept") : t("config.secret.paste");
  }

  if (generated) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-data text-ink-3 text-small">
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
          <code className="block break-all rounded-sm border border-line-strong bg-sunken px-2.5 py-2 font-data text-ink text-small">
            {shown}
          </code>
        ) : null}

        {revealed && !shown ? (
          <span className="text-ink-3 text-small">
            {t("config.secret.shown")}
          </span>
        ) : null}
      </div>
    );
  }

  // Uncontrolled on purpose: a typed secret is never kept here, not even as the input's value.
  return (
    <div className="flex flex-col gap-2">
      <input
        aria-invalid={wrong ? true : undefined}
        aria-label={label}
        autoComplete="off"
        className={controlClass("data", wrong)}
        id={name}
        name={name}
        onChange={(event) => onChange?.(event.target.value)}
        placeholder={placeholder()}
        required={required && !held}
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
