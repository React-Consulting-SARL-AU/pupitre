import { entryProblem } from "@renderer/i18n/entry-problem";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isEntryName } from "@renderer/lib/files";
import type { AgentError } from "@shared/agent";
import { Check, X } from "lucide-react";
import { useId, useState } from "react";
import { controlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";

/**
 * A name edited where it stands: Enter or the tick sends it, Escape or the
 * cross puts the old name back, and a refusal stays under the field.
 */
export function FileRenameField({
  name,
  onRename,
  onCancel,
}: {
  name: string;
  onRename: (to: string) => Promise<AgentError | null>;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const problemId = useId();
  const [wanted, setWanted] = useState(name);
  const [refusal, setRefusal] = useState<AgentError | null>(null);

  const to = wanted.trim();
  const ready = to.length > 0 && to !== name && isEntryName(to);
  const problem = entryProblem(t, to, refusal);

  async function submit(): Promise<void> {
    if (ready) {
      setRefusal(await onRename(to));
    }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1 px-2 py-1.5">
      <div className="flex items-center gap-1.5">
        <input
          aria-describedby={problem ? problemId : undefined}
          aria-invalid={problem ? true : undefined}
          aria-label={t("files.rename.label", { name })}
          autoFocus
          className={`${controlClass("data", Boolean(problem))} py-1 text-small`}
          onChange={(event) => {
            setWanted(event.target.value);
            setRefusal(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              onCancel();
            }
          }}
          value={wanted}
        />
        <IconButton
          disabled={!ready}
          icon={Check}
          label={t("files.rename.confirm")}
          onClick={submit}
          size={12}
        />
        <IconButton
          icon={X}
          label={t("common.cancel")}
          onClick={onCancel}
          size={12}
          variant="discreet"
        />
      </div>

      {problem ? (
        <span className="text-danger text-small leading-relaxed" id={problemId}>
          {problem}
        </span>
      ) : null}
    </div>
  );
}
