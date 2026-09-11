import { Button } from "@renderer/components/ui/button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import { History, Play } from "lucide-react";

/**
 * A tab the last run left, waiting to be picked up.
 *
 * The session it names is still on the machine; the app simply has not attached
 * to it yet. Saying so is the point: an empty black rectangle would read as a
 * session that failed rather than one nobody has asked for.
 */
export function TerminalDormantNotice({ onResume }: { onResume: Gesture }) {
  const t = useTranslations();

  return (
    <EmptyState
      action={
        <Button icon={Play} onClick={onResume} size="sm" variant="inverse">
          {t("terminals.dormant.resume")}
        </Button>
      }
      detail={t("terminals.dormant.detail")}
      icon={History}
      title={t("terminals.dormant.title")}
    />
  );
}
