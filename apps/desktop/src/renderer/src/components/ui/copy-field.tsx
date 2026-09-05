import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { IconButton } from "./icon-button";
import { Label } from "./label";

const FEEDBACK_MS = 1600;

/**
 * A line meant to leave the app: a public key, a command to paste.
 *
 * It wraps rather than scrolls, because what matters is being able to read the
 * whole thing before trusting it to a server.
 */
export function CopyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: string;
}) {
  const t = useTranslations();

  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), FEEDBACK_MS);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-w-0">
      <Label>{label}</Label>

      <div className="mt-1.5 flex items-start gap-2 rounded-md border border-line-strong bg-sunken px-3 py-2">
        <code className="min-w-0 flex-1 break-all font-data text-[11px] text-ink-2 leading-relaxed">
          {value}
        </code>
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? t("common.copied") : t("common.copy", { label })}
          onClick={copy}
          variant="discreet"
        />
      </div>

      {help ? <p className="mt-1.5 text-[11px] text-ink-3">{help}</p> : null}
    </div>
  );
}
