import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { CONNECTION_LABEL } from "@shared/services";
import { Check, Copy, Eye, EyeOff } from "lucide-react";
import { useState } from "react";

const MASK = "••••••••••••";

const FEEDBACK_MS = 1600;

/** The value lives in the main process: copying never brings it across the bridge. */
export function ServiceCredentialRow({
  label,
  onReveal,
  onCopy,
}: {
  label: string;
  onReveal: () => Promise<string | null>;
  onCopy: () => Promise<boolean>;
}) {
  const t = useTranslations();

  const [shown, setShown] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [asking, setAsking] = useState(false);

  async function reveal() {
    setAsking(true);
    setShown(await onReveal());
    setAsking(false);
  }

  async function copy() {
    setAsking(true);
    setCopied(await onCopy());
    setAsking(false);
    setTimeout(() => setCopied(false), FEEDBACK_MS);
  }

  return (
    <li
      className="flex flex-wrap items-center gap-3 px-4 py-3"
      data-credential={label}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-control text-ink">
          {label === CONNECTION_LABEL
            ? t("services.credentials.connectionLabel")
            : label}
        </span>
        <code
          className="mt-0.5 block break-all font-data text-ink-3 text-small"
          data-revealed={shown === null ? "false" : "true"}
        >
          {shown ?? MASK}
        </code>
      </span>

      {shown === null ? (
        <Button icon={Eye} loading={asking} onClick={reveal} size="sm">
          {t("services.credential.reveal")}
        </Button>
      ) : (
        <Button
          icon={EyeOff}
          onClick={() => setShown(null)}
          size="sm"
          variant="discreet"
        >
          {t("common.hide")}
        </Button>
      )}

      <Button
        icon={copied ? Check : Copy}
        loading={asking}
        onClick={copy}
        size="sm"
      >
        {copied ? t("common.copied") : t("services.credential.copy")}
      </Button>
    </li>
  );
}
