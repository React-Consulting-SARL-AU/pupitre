import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
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
 * one has to be, before it is pressed rather than after nothing happened. The
 * editor then resolves the server through the system's own SSH file, which
 * knows it only once that file includes the app's: on a server of the app
 * whose line is not there yet, the button asks for it first.
 */
export function ProjectEditors({
  editors,
  root,
  share,
  onShare,
  onOpen,
}: {
  editors: readonly RemoteEditor[];
  root: string | null;
  /** The system's file to name when asking, or nothing when it already resolves the server. */
  share: string | null;
  onShare: () => Promise<void>;
  onOpen: (editorId: RemoteEditor["id"], path: string) => void;
}) {
  const t = useTranslations();

  if (editors.length === 0 || !root) {
    return null;
  }

  return (
    <>
      {editors.map((editor) =>
        share ? (
          <ConfirmButton
            confirmLabel={t("project.editors.shareAndOpen")}
            confirmVariant="inverse"
            icon={FolderCode}
            key={editor.id}
            onConfirm={async () => {
              await onShare();
              onOpen(editor.id, root);
            }}
            question={t("project.editors.shareQuestion", {
              editor: editor.name,
              file: share,
              root,
            })}
            variant="default"
          >
            {editor.name}
          </ConfirmButton>
        ) : (
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
        )
      )}
    </>
  );
}
