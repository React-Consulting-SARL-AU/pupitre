import { useTranslations } from "@renderer/i18n/use-translations";
import { isEntryName } from "@renderer/lib/files";
import { FilePlus, FolderPlus, type LucideIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field, fieldAria, fieldControlClass } from "../ui/field";

/**
 * The name of a file or a folder to make where the reader stands, asked in
 * a dialog.
 *
 * The name is a name and nothing else — a slash would be a path, and the
 * entry is made in the folder on screen. The field takes the focus so the
 * name is typed at once, Enter sends it, and the dialog goes away once the
 * entry has been asked for, so the list that comes back is what the reader
 * looks at.
 */

export type EntryKind = "file" | "dir";

export const ENTRY_CREATE_ICON: Record<EntryKind, LucideIcon> = {
  dir: FolderPlus,
  file: FilePlus,
};

export const ENTRY_CREATE_KEYS = {
  dir: {
    placeholder: "files.newFolder.placeholder",
    title: "files.newFolder.title",
  },
  file: {
    placeholder: "files.newFile.placeholder",
    title: "files.newFile.title",
  },
} as const;

export function EntryCreateDialog({
  kind,
  name,
  onCreate,
  onClose,
}: {
  kind: EntryKind;
  /** Ties the caption and the help to the input, and names it in a test. */
  name: string;
  onCreate: (entry: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();

  const input = useRef<HTMLInputElement | null>(null);
  const [wanted, setWanted] = useState("");

  const entry = wanted.trim();
  const ready = entry.length > 0 && isEntryName(entry);

  async function create() {
    if (!ready) {
      return;
    }

    await onCreate(entry);
    onClose();
  }

  return (
    <Dialog
      actions={
        <>
          <Button onClick={onClose} size="sm" variant="discreet">
            {t("common.cancel")}
          </Button>
          <Button
            disabled={!ready}
            icon={ENTRY_CREATE_ICON[kind]}
            onClick={create}
            size="sm"
            variant="inverse"
          >
            {t("files.new.create")}
          </Button>
        </>
      }
      focus={input}
      name={name}
      onClose={onClose}
      open
      title={t(ENTRY_CREATE_KEYS[kind].title)}
    >
      <Field label={t("files.new.label")} name={name}>
        <input
          {...fieldAria({ help: true, name })}
          className={fieldControlClass}
          onChange={(event) => setWanted(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              create();
            }
          }}
          placeholder={t(ENTRY_CREATE_KEYS[kind].placeholder)}
          ref={input}
          value={wanted}
        />
      </Field>
    </Dialog>
  );
}
