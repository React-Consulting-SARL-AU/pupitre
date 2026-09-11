import { Button } from "@renderer/components/ui/button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import { RotateCw, X } from "lucide-react";

/**
 * The process is gone, and the tab says so where the prompt used to be.
 *
 * What was printed stays on screen to be read; the two ways out are a fresh
 * process in the same tab, or the tab itself going away.
 */
export function TerminalEndedBar({
  code,
  onReopen,
  onClose,
}: {
  code: number;
  onReopen: Gesture;
  onClose: () => void;
}) {
  const t = useTranslations();

  return (
    <div
      className="flex shrink-0 flex-wrap items-center gap-3 border-line border-t bg-surface px-3 py-2"
      data-ended={code}
    >
      <StatusDot
        shape="struck"
        size={11}
        tone={code === 0 ? "neutral" : "danger"}
      />

      <p className="min-w-0 flex-1 text-[13px]">
        <span className="font-medium text-ink">
          {t("terminals.ended.title")}
        </span>
        <span className="ml-2 font-data text-[12px] text-ink-3">
          {t("terminals.ended.detail", { code })}
        </span>
      </p>

      <Button icon={RotateCw} onClick={onReopen} size="sm" variant="inverse">
        {t("terminals.ended.reopen")}
      </Button>
      <Button icon={X} onClick={onClose} size="sm" variant="discreet">
        {t("terminals.ended.closeTab")}
      </Button>
    </div>
  );
}
