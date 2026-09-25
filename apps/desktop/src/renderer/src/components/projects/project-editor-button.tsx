import { ConfirmDialog } from "@renderer/components/ui/confirm-button";
import { IconButton } from "@renderer/components/ui/icon-button";
import { logoGlyph } from "@renderer/components/ui/service-logo";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { RemoteEditor } from "@shared/editors";
import { FolderCode } from "lucide-react";
import { useState } from "react";

/**
 * One editor, as its mark: the name and the folder live in the bubble.
 *
 * On a server of the app whose line the system's SSH file does not carry yet,
 * the mark opens the question first, and the editor only once the line is in.
 */
export function ProjectEditorButton({
  editor,
  root,
  share,
  onShare,
  onOpen,
}: {
  editor: RemoteEditor;
  root: string;
  share: string | null;
  onShare: () => Promise<void>;
  onOpen: (editorId: RemoteEditor["id"], path: string) => Promise<void>;
}) {
  const t = useTranslations();
  const [asking, setAsking] = useState(false);
  const [working, setWorking] = useState(false);

  const icon = logoGlyph(editor.logo) ?? FolderCode;
  const label = t("project.editors.open", { editor: editor.name, root });

  if (!share) {
    return (
      <IconButton
        icon={icon}
        label={label}
        onClick={() => onOpen(editor.id, root)}
        size={16}
      />
    );
  }

  async function confirm() {
    setWorking(true);

    try {
      await onShare();
      await onOpen(editor.id, root);
      setAsking(false);
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <IconButton
        asks
        icon={icon}
        label={label}
        onClick={() => setAsking(true)}
        size={16}
      />

      <ConfirmDialog
        confirmLabel={t("project.editors.shareAndOpen")}
        confirmVariant="inverse"
        onCancel={() => setAsking(false)}
        onConfirm={confirm}
        open={asking}
        question={t("project.editors.shareQuestion", {
          editor: editor.name,
          file: share,
          root,
        })}
        title={editor.name}
        working={working}
      />
    </>
  );
}
