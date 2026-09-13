import { Button } from "@renderer/components/ui/button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RemoteEditor } from "@shared/editors";
import { FolderCode } from "lucide-react";

/**
 * The editors this server installed, and nothing more.
 *
 * A button exists because the agent reported the matching module — JetBrains,
 * VS Code and Cursor, Zed. The folder is the absolute one git named for this
 * project; without it there is nothing to open, and no button.
 *
 * The button hands a deep link to this computer, and nothing answers if the
 * editor is not installed here: the app cannot tell, so the button says which
 * one has to be, before it is pressed rather than after nothing happened.
 */
export function ProjectEditors({
  editors,
  root,
  onOpen,
}: {
  editors: readonly RemoteEditor[];
  root: string | null;
  onOpen: (editorId: RemoteEditor["id"], path: string) => void;
}) {
  const t = useTranslations();

  if (editors.length === 0 || !root) {
    return null;
  }

  return (
    <>
      {editors.map((editor) => (
        <Button
          hint={t("project.editors.open", {
            editor: editor.name,
            root,
          })}
          icon={FolderCode}
          key={editor.id}
          onClick={() => onOpen(editor.id, root)}
        >
          {editor.name}
        </Button>
      ))}
    </>
  );
}
