import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IconButton } from "./icon-button";
import { Label } from "./label";

const FEEDBACK_MS = 1600;

// Wraps rather than scrolls, so the whole value can be read before it is trusted to a server.
export function CopyField({
  label,
  value,
  help,
  lines = false,
}: {
  label: string;
  value: string;
  help?: string;
  lines?: boolean;
}) {
  const t = useTranslations();

  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    []
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      setCopied(false);

      return;
    }

    setCopied(true);

    if (timer.current) {
      clearTimeout(timer.current);
    }

    timer.current = setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <div className="min-w-0">
      <Label>{label}</Label>

      <div className="mt-1.5 flex items-start gap-2 rounded-md border border-line-strong bg-sunken px-3 py-2">
        <code
          className={`min-w-0 flex-1 break-all font-data text-ink-2 text-small leading-relaxed ${lines ? "whitespace-pre-line" : ""}`}
        >
          {value}
        </code>
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? t("common.copied") : t("common.copy", { label })}
          onClick={copy}
          variant="discreet"
        />
      </div>

      {help ? <p className="mt-1.5 text-ink-3 text-small">{help}</p> : null}
    </div>
  );
}
