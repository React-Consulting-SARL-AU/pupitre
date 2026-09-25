import { IconButton } from "@renderer/components/ui/icon-button";
import { Label } from "@renderer/components/ui/label";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

const FEEDBACK_MS = 1600;

export function AccountCode({
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
      <div className="flex items-center gap-2">
        <StatusDot shape="breathing" size={10} />
        <Label>{label}</Label>
      </div>

      <div className="mt-2 flex items-center gap-3 rounded-md border border-line-strong bg-sunken px-4 py-3.5">
        {/* Typed by hand into a browser: the data face keeps 0 and O apart. */}
        <code className="min-w-0 flex-1 break-all font-data text-ink text-xl leading-snug tracking-[0.28em]">
          {value}
        </code>
        <IconButton
          icon={copied ? Check : Copy}
          label={copied ? t("common.copied") : t("common.copy", { label })}
          onClick={copy}
        />
      </div>

      {help ? (
        <p className="mt-2 text-ink-3 text-small leading-relaxed">{help}</p>
      ) : null}
    </div>
  );
}
