import { useTranslations } from "@renderer/i18n/use-translations";
import { isEntryName } from "@renderer/lib/files";
import { FolderPlus } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../ui/button";
import { Dialog } from "../ui/dialog";
import { Field, fieldAria, fieldControlClass } from "../ui/field";

/**
 * The name of a folder to make where the reader stands, asked in a dialog.
 *
 * The name is a name and nothing else — a slash would be a path, and the
 * folder is made in the one on screen. The field takes the focus so the name
 * is typed at once, Enter sends it, and the dialog goes away once the folder
 * has been asked for, so the list that comes back is what the reader looks at.
 */
export function FolderCreateDialog({
  name,
  onCreate,
  onClose,
}: {
  /** Ties the caption and the help to the input, and names it in a test. */
  name: string;
  onCreate: (folder: string) => Promise<void>;
  onClose: () => void;
}) {
  const t = useTranslations();

  const input = useRef<HTMLInputElement | null>(null);
  const [wanted, setWanted] = useState("");

  const folder = wanted.trim();
  const ready = folder.length > 0 && isEntryName(folder);

  async function create() {
    if (!ready) {
      return;
    }

    await onCreate(folder);
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
            icon={FolderPlus}
            onClick={create}
            size="sm"
            variant="inverse"
          >
            {t("files.newFolder.create")}
          </Button>
        </>
      }
      focus={input}
      name={name}
      onClose={onClose}
      open
      title={t("files.newFolder.title")}
    >
      <Field label={t("files.newFolder.label")} name={name}>
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
          placeholder={t("files.newFolder.placeholder")}
          ref={input}
          value={wanted}
        />
      </Field>
    </Dialog>
  );
}
