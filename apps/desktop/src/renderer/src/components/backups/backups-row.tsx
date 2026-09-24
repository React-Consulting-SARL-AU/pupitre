import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { countsLabel } from "@renderer/lib/backups";
import { dated, weight } from "@renderer/lib/format";
import type { PlatformBackup } from "@shared/backups";
import { History, Trash2 } from "lucide-react";

/** One backup of the server: when, what it holds, and the two things to do with it. */
export function BackupsRow({
  backup,
  busy,
  onRevert,
  onRemove,
}: {
  backup: PlatformBackup;
  /** A revert or a removal is under way: no other gesture starts beside it. */
  busy: boolean;
  onRevert: () => void;
  onRemove: () => Promise<void>;
}) {
  const t = useTranslations();

  const when = dated(backup.created_at);

  return (
    <li
      className="flex flex-wrap items-center gap-4 px-5 py-3.5"
      data-backup={backup.id}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13px] text-ink">
          {when}
          <span className="ml-2 text-[12px] text-ink-3">
            {t(
              backup.trigger === "manual"
                ? "backups.trigger.manual"
                : "backups.trigger.schedule"
            )}
          </span>
        </p>
        <p className="mt-0.5 font-data text-[12px] text-ink-3">
          {weight(backup.bytes)} · {countsLabel(t, backup.counts)}
        </p>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Button disabled={busy} icon={History} onClick={onRevert} size="sm">
          {t("backups.revert.open")}
        </Button>
        <ConfirmButton
          confirmLabel={t("backups.remove.confirm")}
          disabled={busy}
          icon={Trash2}
          onConfirm={onRemove}
          question={t("backups.remove.question", { date: when })}
          size="sm"
          variant="danger"
        >
          {t("backups.remove.label")}
        </ConfirmButton>
      </div>
    </li>
  );
}
