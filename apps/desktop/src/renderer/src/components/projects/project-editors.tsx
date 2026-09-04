import { Button } from "@renderer/components/ui/button";
import type { RemoteEditor } from "@shared/editors";
import { FolderCode } from "lucide-react";

/**
 * The editors this server installed, and nothing more.
 *
 * A button exists because the agent reported the matching module — JetBrains,
 * VS Code and Cursor, Zed. The folder is the absolute one git named for this
 * project; without it there is nothing to open, and no button.
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
  if (editors.length === 0 || !root) {
    return null;
  }

  return (
    <>
      {editors.map((editor) => (
        <Button
          icon={FolderCode}
          key={editor.id}
          onClick={() => onOpen(editor.id, root)}
          title={`Ouvrir ${root} dans ${editor.name}`}
        >
          {editor.name}
        </Button>
      ))}
    </>
  );
}
