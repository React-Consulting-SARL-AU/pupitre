import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { nameOf, renderedFormOf } from "@renderer/lib/files";
import type {
  PreviewState,
  PreviewView,
  WriteState,
} from "@renderer/stores/files";
import { Download, FileQuestion, RotateCw, X } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { ConfirmDialog } from "../ui/confirm-button";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice } from "../ui/error-notice";
import { IconButton } from "../ui/icon-button";
import { Segmented } from "../ui/segmented";
import { Skeleton } from "../ui/skeleton";
import { StatusDot } from "../ui/status-dot";
import { WaitingLine } from "../ui/waiting-line";
import { FileSheet } from "./file-sheet";
import { FileTextPane } from "./file-text-pane";

const VIEWS: readonly PreviewView[] = ["rendered", "source"];

const VIEW_KEY: Record<
  PreviewView,
  "files.view.rendered" | "files.view.source"
> = {
  rendered: "files.view.rendered",
  source: "files.view.source",
};

/**
 * The right pane: the file the reader picked, in whatever form it takes.
 *
 * Text is edited and saved from here, an image is shown, and a file the
 * channel does not carry shows its sheet and offers the one way to open it:
 * a transfer to this computer, on its own channel. A text that also has a
 * drawn form — Markdown, SVG — opens drawn, and a word in the header turns it
 * into the code it is; the drawing follows the buffer, so an edit is seen
 * before it is saved. A write the agent refused because the file changed is
 * said as such, with the one way out: reading it again, which drops the
 * buffer, and says so.
 */
export function FilePreview({
  preview,
  view,
  write,
  draft,
  leaving,
  onShow,
  onView,
  onSave,
  onReread,
  onClose,
  onEdit,
  onConfirmLeave,
  onStay,
  onDownload,
}: {
  preview: PreviewState;
  view: PreviewView;
  write: WriteState;
  draft: string | null;
  /** True while a gesture that would drop the buffer waits for the reader's word. */
  leaving: boolean;
  onShow: (path: string) => Promise<void>;
  onView: (view: PreviewView) => void;
  onSave: () => Promise<void>;
  onReread: () => Promise<void>;
  onClose: () => void;
  onEdit: (text: string) => void;
  onConfirmLeave: () => void;
  onStay: () => void;
  /** Brings the shown file to this computer; answers once the transfer is queued. */
  onDownload: () => Promise<void>;
}) {
  const t = useTranslations();

  if (preview.status === "idle") {
    return <EmptyState icon={FileQuestion} title={t("files.preview.empty")} />;
  }

  const name = nameOf(preview.path);
  const edited = draft !== null;
  const stale = write.status === "stale" ? agentText(t, write.error) : null;
  const form = preview.status === "text" ? renderedFormOf(preview.path) : null;

  return (
    <section
      aria-label={t("files.preview.label", { name })}
      className="flex h-full min-h-0 flex-col gap-3"
      data-preview={preview.status}
    >
      <header className="flex items-center gap-3">
        <span className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate font-data text-control text-ink">
            {name}
          </span>
          {edited ? (
            <StatusDot
              label={t("files.preview.edited")}
              shape="filled"
              size={8}
            />
          ) : null}
        </span>

        {form ? (
          <Segmented
            label={t("files.view.label")}
            onChange={onView}
            options={VIEWS.map((candidate) => ({
              label: t(VIEW_KEY[candidate]),
              value: candidate,
            }))}
            value={view}
          />
        ) : null}

        <IconButton
          icon={X}
          label={t("files.preview.close")}
          onClick={onClose}
          size={12}
          variant="discreet"
        />
      </header>

      <ConfirmDialog
        confirmLabel={t("files.leave.discard")}
        onCancel={onStay}
        onConfirm={onConfirmLeave}
        open={leaving}
        question={t("files.leave.question", { name })}
        title={t("files.leave.title", { name })}
      />

      {stale ? (
        <Callout
          action={
            <Button icon={RotateCw} onClick={onReread} size="sm">
              {t("files.stale.reread")}
            </Button>
          }
          fix={stale.fix}
          name="files.stale"
          tone="warn"
        >
          {stale.message}
        </Callout>
      ) : null}

      {write.status === "failed" ? (
        <ErrorNotice
          error={write.error}
          onRetry={onSave}
          retryLabel={t("files.save")}
        />
      ) : null}

      {preview.status === "reading" ? (
        <div className="flex flex-col gap-3">
          <WaitingLine className="font-data text-small">
            {t("files.preview.reading")}
          </WaitingLine>
          <Skeleton className="h-40 w-full" />
        </div>
      ) : null}

      {preview.status === "failed" ? (
        <ErrorNotice
          error={preview.error}
          onRetry={() => onShow(preview.path)}
        />
      ) : null}

      {preview.status === "text" ? (
        <FileTextPane
          draft={draft}
          onEdit={onEdit}
          onSave={onSave}
          path={preview.path}
          stat={preview.stat}
          text={preview.text}
          view={view}
          write={write}
        />
      ) : null}

      {preview.status === "image" ? (
        <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <img
            alt={t("files.preview.alt", { name })}
            className="max-h-[60vh] w-full rounded-md bg-sunken object-contain"
            height={preview.size?.height}
            src={preview.url}
            width={preview.size?.width}
          />
          <FileSheet stat={preview.stat} />
        </div>
      ) : null}

      {preview.status === "unreadable" ? (
        <div className="flex flex-col gap-4">
          <FileSheet stat={preview.stat} />

          <Callout
            action={
              <Button
                hint={t("transfers.download.title")}
                icon={Download}
                onClick={onDownload}
                size="sm"
              >
                {t("transfers.download")}
              </Button>
            }
            fix={
              preview.error
                ? agentText(t, preview.error).fix
                : t("files.unreadable.fix")
            }
            name="files.unreadable"
            tone="info"
          >
            {preview.error
              ? agentText(t, preview.error).message
              : t("files.unreadable.message")}
          </Callout>
        </div>
      ) : null}
    </section>
  );
}
