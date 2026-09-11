import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { agentText } from "@renderer/i18n/agent-error";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import { heldCount } from "@renderer/lib/files";
import type { AgentError } from "@shared/agent";
import { Button } from "../ui/button";

function confirmLabel(
  t: Translate,
  refused: boolean,
  held: number | null
): string {
  if (!refused) {
    return t("files.remove.confirm");
  }

  return held === null
    ? t("files.remove.confirmAll")
    : t.plural("files.remove.confirmHeld", held);
}

/**
 * A deletion asked twice, under the row it would take away.
 *
 * The first question names the entry. When the agent refuses a folder because
 * it holds something, the refusal is printed as it came — it says how many
 * entries — and the second question names that count: what would go is said
 * before it goes, never after.
 */
export function FileRemoveConfirm({
  entry,
  refusal,
  onRemove,
  onCancel,
}: {
  entry: FileEntry;
  /** The agent's answer to the first attempt, when it held the folder back. */
  refusal: AgentError | null;
  onRemove: (recursive: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const held = refusal ? heldCount(refusal.message) : null;
  const said = refusal ? agentText(t, refusal) : null;

  return (
    <div
      aria-label={t("files.remove.question", { name: entry.name })}
      className="flex flex-col gap-2 border-line border-t bg-sunken px-3 py-2.5"
      data-remove={entry.name}
      role="alertdialog"
    >
      {said ? (
        <div className="text-[12px] text-ink-2 leading-relaxed">
          <p className="font-medium text-ink">{said.message}</p>
          {said.fix ? <p>{said.fix}</p> : null}
        </div>
      ) : (
        <p className="text-[12px] text-ink-2">
          {t(
            entry.kind === "dir"
              ? "files.remove.folderQuestion"
              : "files.remove.question",
            { name: entry.name }
          )}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button
          onClick={() => onRemove(refusal !== null)}
          size="sm"
          variant="destructive"
        >
          {confirmLabel(t, refusal !== null, held)}
        </Button>
        <Button onClick={onCancel} size="sm" variant="discreet">
          {t("common.cancel")}
        </Button>
      </div>
    </div>
  );
}
