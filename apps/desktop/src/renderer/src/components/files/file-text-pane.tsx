import type { FsStatResult } from "@pupitre/shared/agent-protocol/files";
import { useTranslations } from "@renderer/i18n/use-translations";
import { renderedFormOf } from "@renderer/lib/files";
import { since } from "@renderer/lib/format";
import type { PreviewView, WriteState } from "@renderer/stores/files";
import { Save } from "lucide-react";
import { Button } from "../ui/button";
import { StatusDot } from "../ui/status-dot";
import { FileEditor } from "./file-editor";
import { FileMarkdownView } from "./file-markdown-view";
import { FileSvgView } from "./file-svg-view";

export function FileTextPane({
  path,
  text,
  stat,
  draft,
  view,
  write,
  onEdit,
  onSave,
}: {
  path: string;
  text: string;
  stat: FsStatResult;
  draft: string | null;
  view: PreviewView;
  write: WriteState;
  onEdit: (text: string) => void;
  onSave: () => Promise<void>;
}) {
  const t = useTranslations();

  const edited = draft !== null;
  const form = renderedFormOf(path);
  const drawn = form !== null && view === "rendered";

  return (
    <>
      {drawn && form === "markdown" ? (
        <FileMarkdownView text={draft ?? text} />
      ) : null}

      {drawn && form === "svg" ? (
        <FileSvgView path={path} stat={stat} text={draft ?? text} />
      ) : null}

      {drawn ? null : (
        <FileEditor
          draft={draft}
          onChange={onEdit}
          onSave={onSave}
          path={path}
          text={text}
        />
      )}

      <footer className="flex items-center justify-between gap-3">
        <span
          className="flex items-center gap-2 font-data text-caption text-ink-3"
          role="status"
        >
          {write.status === "written" ? (
            <>
              <StatusDot shape="filled" size={8} tone="ok" />
              {t("files.save.done", { when: since(write.at) })}
            </>
          ) : null}
        </span>

        <Button
          disabled={!edited}
          hint={t("files.save.title")}
          icon={Save}
          loading={write.status === "writing"}
          onClick={onSave}
          size="sm"
          variant={edited ? "inverse" : "default"}
        >
          {t("files.save")}
        </Button>
      </footer>
    </>
  );
}
