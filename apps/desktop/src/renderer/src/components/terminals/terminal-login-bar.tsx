import { Button } from "@renderer/components/ui/button";
import { IconButton } from "@renderer/components/ui/icon-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ExternalLink, LogIn, X } from "lucide-react";

/** The host is shown, not the address: the reader sees where the browser will go. */
export function TerminalLoginBar({
  host,
  opened,
  onOpen,
  onDismiss,
}: {
  host: string;
  opened: boolean;
  onOpen: () => Promise<void>;
  onDismiss: () => void;
}) {
  const t = useTranslations();

  return (
    <div className="flex shrink-0 items-center gap-3 border-line border-b bg-raised px-3 py-2">
      <LogIn className="shrink-0 text-ink-3" size={14} strokeWidth={1.5} />

      <p className="min-w-0 flex-1 text-[13px] text-ink-2">
        {opened ? t("terminals.loginOpened") : t("terminals.loginWaiting")}
        <span className="font-data text-ink">{host}</span>
      </p>

      <Button
        icon={ExternalLink}
        onClick={onOpen}
        size="sm"
        variant={opened ? "discreet" : "inverse"}
      >
        {opened ? t("terminals.loginAgain") : t("terminals.loginOpen")}
      </Button>

      <IconButton
        icon={X}
        label={t("terminals.loginDismiss")}
        onClick={onDismiss}
        size={13}
      />
    </div>
  );
}
