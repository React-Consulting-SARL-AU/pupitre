import { IconButton } from "@renderer/components/ui/icon-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { historyChord } from "@renderer/lib/history-shortcuts";
import { isMac } from "@renderer/lib/platform";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function HistoryArrows({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
}) {
  const t = useTranslations();

  return (
    <nav aria-label={t("shell.history.label")} className="flex gap-0.5">
      <IconButton
        disabled={!canGoBack}
        icon={ChevronLeft}
        label={t("shell.history.back", {
          shortcut: historyChord("back", isMac),
        })}
        onClick={onBack}
        size={15}
        variant="discreet"
      />
      <IconButton
        disabled={!canGoForward}
        icon={ChevronRight}
        label={t("shell.history.forward", {
          shortcut: historyChord("forward", isMac),
        })}
        onClick={onForward}
        size={15}
        variant="discreet"
      />
    </nav>
  );
}
