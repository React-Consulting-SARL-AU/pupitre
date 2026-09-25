import { useTranslations } from "@renderer/i18n/use-translations";
import type { RemoteEditor } from "@shared/editors";
import { ProjectEditorButton } from "./project-editor-button";

export function ProjectEditors({
  editors,
  root,
  share,
  onShare,
  onOpen,
}: {
  editors: readonly RemoteEditor[];
  root: string | null;
  /** The system SSH file to share into, or null when it already resolves the server. */
  share: string | null;
  onShare: () => Promise<void>;
  onOpen: (editorId: RemoteEditor["id"], path: string) => Promise<void>;
}) {
  const t = useTranslations();

  if (editors.length === 0 || !root) {
    return null;
  }

  return (
    <fieldset
      aria-label={t("project.editors.group")}
      className="flex items-center gap-1"
    >
      <span className="mr-1 text-ink-3 text-small">
        {t("project.editors.label")}
      </span>
      {editors.map((editor) => (
        <ProjectEditorButton
          editor={editor}
          key={editor.id}
          onOpen={onOpen}
          onShare={onShare}
          root={root}
          share={share}
        />
      ))}
    </fieldset>
  );
}
