import { useTranslations } from "@renderer/i18n/use-translations";
import { FolderPlus } from "lucide-react";
import { useState } from "react";
import { IconButton } from "../ui/icon-button";
import { FolderCreateDialog } from "./folder-create-dialog";

/**
 * The gesture that makes a folder where the reader stands: one button in the
 * header, and the dialog it opens. The dialog is mounted anew each time, so
 * it never remembers a name from before.
 */
export function FolderCreate({
  name,
  disabled = false,
  onCreate,
}: {
  /** Ties the caption and the help to the input, and names it in a test. */
  name: string;
  /** No folder is on screen yet, so none can be made in it. */
  disabled?: boolean;
  onCreate: (folder: string) => Promise<void>;
}) {
  const t = useTranslations();

  const [asking, setAsking] = useState(false);

  return (
    <>
      <IconButton
        disabled={disabled}
        icon={FolderPlus}
        label={t("files.newFolder.title")}
        onClick={() => setAsking(true)}
      />

      {asking ? (
        <FolderCreateDialog
          name={name}
          onClose={() => setAsking(false)}
          onCreate={onCreate}
        />
      ) : null}
    </>
  );
}
