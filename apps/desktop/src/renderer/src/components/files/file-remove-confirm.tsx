import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { agentLine } from "@renderer/i18n/agent-error";
import type { Translate } from "@renderer/i18n/i18n";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AgentError } from "@shared/agent";
import { useState } from "react";
import { ConfirmDialog } from "../ui/confirm-button";

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

/** How many entries the refusal counts, when it carries the count as a value rather than in its sentence. */
function heldOf(refusal: AgentError | null): number | null {
  const entries = refusal?.phrase?.values?.entries;

  return typeof entries === "number" ? entries : null;
}

/** A folder the agent held back is asked about again, with the refusal as it came. */
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

  const [working, setWorking] = useState(false);

  const question = refusal
    ? agentLine(t, refusal)
    : t(
        entry.kind === "dir"
          ? "files.remove.folderQuestion"
          : "files.remove.question",
        { name: entry.name }
      );

  async function remove(): Promise<void> {
    setWorking(true);

    try {
      await onRemove(refusal !== null);
    } finally {
      setWorking(false);
    }
  }

  return (
    <ConfirmDialog
      confirmLabel={confirmLabel(t, refusal !== null, heldOf(refusal))}
      onCancel={onCancel}
      onConfirm={remove}
      open
      question={question}
      title={t("files.remove.title", { name: entry.name })}
      working={working}
    />
  );
}
