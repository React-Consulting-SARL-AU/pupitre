import { useTranslations } from "@renderer/i18n/use-translations";
import type { RemoteEditor } from "@shared/editors";
import { ProjectEditorButton } from "./project-editor-button";

/**
 * The editors this server installed, and nothing more.
 *
 * A mark exists because the agent reported the matching module — JetBrains,
 * VS Code and Cursor, Zed. The folder is the absolute one git named for this
 * project; without it there is nothing to open, and no mark.
 *
 * The marks stand apart from the project's own gestures, on a line of their
 * own under them: opening a folder on this computer is not starting or
 * syncing the project on the server. Each hands a deep link to this computer, and nothing answers if the editor is not
 * installed here: the app cannot tell, so the bubble says which one has to be,
 * before it is pressed rather than after nothing happened.
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
    <fieldset
      aria-label={t("project.editors.group")}
      className="flex items-center gap-1"
    >
      <span className="mr-1 text-[12px] text-ink-3">
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
