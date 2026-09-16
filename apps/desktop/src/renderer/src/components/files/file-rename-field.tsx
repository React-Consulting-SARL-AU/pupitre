import { useTranslations } from "@renderer/i18n/use-translations";
import { isEntryName } from "@renderer/lib/files";
import { Check, X } from "lucide-react";
import { useState } from "react";
import { fieldControlClass } from "../ui/field";
import { IconButton } from "../ui/icon-button";

/**
 * A name edited where it stands: the row keeps its place, the input takes
 * the name's, and Enter or the tick sends it. Escape or the cross puts the
 * old name back. The same name is not a move, and is not sent.
 */
export function FileRenameField({
  name,
  onRename,
  onCancel,
}: {
  name: string;
  onRename: (to: string) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const [wanted, setWanted] = useState(name);

  const to = wanted.trim();
  const ready = to.length > 0 && to !== name && isEntryName(to);

  function submit(): Promise<void> | undefined {
    return ready ? onRename(to) : undefined;
  }

  return (
    <div className="flex h-9 min-w-0 flex-1 items-center gap-1.5 px-2">
      <input
        aria-label={t("files.rename.label", { name })}
        autoFocus
        className={`${fieldControlClass} py-1 text-[12px]`}
        onChange={(event) => setWanted(event.target.value)}
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
  );
}
