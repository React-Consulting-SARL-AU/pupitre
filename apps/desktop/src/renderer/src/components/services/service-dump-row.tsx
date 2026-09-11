import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { databaseOfDump } from "@renderer/lib/dumps";
import { since, weight } from "@renderer/lib/format";
import { RotateCcw, Trash2 } from "lucide-react";

/**
 * One dump of the server's folder, and the two things it can become.
 *
 * Restoring names the database the file feeds — read off the file name the
 * way the agent reads it — so the reader sees what will be overwritten before
 * confirming. Removing is confirmed too: a dump is what one goes back to.
 */
export function ServiceDumpRow({
  dump,
  busy,
  onRestore,
  onRemove,
}: {
  dump: FileEntry;
  /** Another gesture is in flight: the row's own wait and takes none. */
  busy: boolean;
  onRestore: () => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const t = useTranslations();

  const database = databaseOfDump(dump.name);
  const modified = Date.parse(dump.modified_at);
  const facts = [
    weight(dump.size_bytes),
    Number.isNaN(modified) ? dump.modified_at : since(modified),
  ];

  return (
    <li
      className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2"
      data-dump={dump.name}
    >
      <div className="min-w-0 flex-1">
        <p className="truncate font-data text-[12px] text-ink">{dump.name}</p>
        <p className="font-data text-[11px] text-ink-3 tabular-nums">
          {facts.join(" · ")}
          {" · "}
          {t("services.dumps.feeds", { database })}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <ConfirmButton
          confirmLabel={t("services.dumps.restoreConfirm")}
          disabled={busy}
          icon={RotateCcw}
          onConfirm={onRestore}
          question={t("services.dumps.restoreQuestion", { database })}
          size="sm"
          variant="default"
        >
          {t("services.dumps.restore")}
        </ConfirmButton>
        <ConfirmButton
          confirmLabel={t("services.dumps.removeConfirm")}
          disabled={busy}
          icon={Trash2}
          onConfirm={onRemove}
          question={t("services.dumps.removeQuestion", { name: dump.name })}
          size="sm"
        >
          {t("services.dumps.remove")}
        </ConfirmButton>
      </div>
    </li>
  );
}
