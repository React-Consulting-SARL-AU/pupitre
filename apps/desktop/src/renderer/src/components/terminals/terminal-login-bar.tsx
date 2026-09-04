import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { LogIn, X } from "lucide-react";

/** The host is shown, not the address: the reader sees where the page leads. */
export function TerminalLoginBar({
  host,
  open,
  onOpen,
  onClose,
}: {
  host: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex shrink-0 items-center gap-3 border-line border-b bg-raised px-3 py-2">
      <LogIn className="shrink-0 text-ink-3" size={14} strokeWidth={1.5} />

      <p className="min-w-0 flex-1 text-[12px] text-ink-2">
        {open ? t("terminals.loginActive") : t("terminals.loginWaiting")}
        <span className="font-data text-ink">{host}</span>
      </p>

      {open ? (
        <Button icon={X} onClick={onClose} size="sm" variant="discreet">
          {t("terminals.closePage")}
        </Button>
      ) : (
        <Button icon={LogIn} onClick={onOpen} size="sm" variant="inverse">
          {t("terminals.loginHere")}
        </Button>
      )}
    </div>
  );
}
