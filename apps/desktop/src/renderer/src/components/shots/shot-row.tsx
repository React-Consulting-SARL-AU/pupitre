import type { Shot } from "@pupitre/shared/agent-protocol/processes";
import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since, weight } from "@renderer/lib/format";
import { Eye, Image as ImageIcon } from "lucide-react";

/** One capture, as the server describes it, and the way to look at it. */
export function ShotRow({
  shot,
  shown,
  onShow,
}: {
  shot: Shot;
  shown: boolean;
  onShow: () => void;
}) {
  const t = useTranslations();

  const taken = Date.parse(shot.created_at);

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${shown ? "bg-sunken" : ""}`}
      data-shown={shown ? "true" : "false"}
    >
      <ImageIcon className="shrink-0 text-ink-3" size={14} strokeWidth={1.5} />

      <div className="min-w-0 flex-1">
        <p className="truncate font-data text-[13px] text-ink">{shot.name}</p>
        <p className="truncate font-data text-[11px] text-ink-3">{shot.path}</p>
      </div>

      <span className="shrink-0 font-data text-[12px] text-ink-3 tabular-nums">
        {weight(shot.size_bytes)}
      </span>

      <span className="w-24 shrink-0 text-right text-[12px] text-ink-4">
        {Number.isNaN(taken) ? shot.created_at : since(taken)}
      </span>

      <Button icon={Eye} onClick={onShow} size="sm">
        {t("shots.view")}
      </Button>
    </div>
  );
}
