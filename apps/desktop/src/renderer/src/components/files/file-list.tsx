import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { FILE_LIST_LIMIT } from "@pupitre/shared/agent-protocol/files";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { FileAction } from "@renderer/lib/file-actions";
import {
  crumbsOf,
  FILE_SORTS,
  type FileSort,
  isHidden,
  sortedEntries,
  under,
} from "@renderer/lib/files";
import type { ListingState, Removal } from "@renderer/stores/files";
import type { AgentError } from "@shared/agent";
import type { RemoteEditor } from "@shared/editors";
import { FolderOpen, RefreshCw, Upload } from "lucide-react";
import { type DragEvent, useState } from "react";
import { CheckLine } from "../ui/check-line";
import { EmptyState } from "../ui/empty-state";
import { ErrorNotice } from "../ui/error-notice";
import { IconButton } from "../ui/icon-button";
import { Segmented } from "../ui/segmented";
import { SkeletonRows } from "../ui/skeleton";
import { WaitingLine } from "../ui/waiting-line";
import { EntryCreate } from "./entry-create";
import { FileRow, type RowMode } from "./file-row";
import { FileTrail } from "./file-trail";

interface Editing {
  path: string;
  mode: Exclude<RowMode, "view">;
}

const SORT_KEY: Record<FileSort, "files.sort.name" | "files.sort.date"> = {
  date: "files.sort.date",
  name: "files.sort.name",
};

function carriesFiles(event: DragEvent<HTMLElement>): boolean {
  return [...event.dataTransfer.types].includes("Files");
}

export function FileList({
  listing,
  rootLabel,
  sort,
  hidden,
  selected,
  editors,
  problem,
  removal,
  onBrowse,
  onShow,
  onSort,
  onHidden,
  onRefresh,
  onMakeFolder,
  onMakeFile,
  onRename,
  onRemove,
  onAct,
  onDismiss,
  onUpload,
  onDrop,
}: {
  listing: ListingState;
  rootLabel: string;
  sort: FileSort;
  hidden: boolean;
  selected: string | null;
  editors: readonly RemoteEditor[];
  problem: AgentError | null;
  removal: Removal | null;
  onBrowse: (path: string) => Promise<void>;
  onShow: (path: string) => Promise<void>;
  onSort: (sort: FileSort) => void;
  onHidden: (hidden: boolean) => void;
  onRefresh: () => Promise<void>;
  onMakeFolder: (name: string) => Promise<AgentError | null>;
  onMakeFile: (name: string) => Promise<AgentError | null>;
  onRename: (path: string, to: string) => Promise<AgentError | null>;
  onRemove: (path: string, recursive: boolean) => Promise<void>;
  onAct: (path: string, action: FileAction) => void;
  onDismiss: () => void;
  onUpload: (dir: string) => Promise<void>;
  onDrop: (dir: string, files: FileList) => Promise<void>;
}) {
  const t = useTranslations();

  const [editing, setEditing] = useState<Editing | null>(null);
  const [dropping, setDropping] = useState(false);

  const path = listing.status === "idle" ? "" : listing.path;
  const entries =
    listing.status === "read"
      ? sortedEntries(listing.entries, sort, hidden)
      : [];
  const concealed =
    listing.status === "read" && !hidden
      ? listing.entries.filter(isHidden).length
      : 0;

  function open(entry: FileEntry, full: string): Promise<void> {
    return entry.kind === "dir" ? onBrowse(full) : onShow(full);
  }

  function act(entry: FileEntry, full: string, action: FileAction): void {
    if (action.id === "open") {
      open(entry, full);
    } else if (action.id === "rename") {
      setEditing({ mode: "renaming", path: full });
    } else if (action.id === "remove") {
      setEditing({ mode: "removing", path: full });
    } else {
      onAct(full, action);
    }
  }

  async function rename(full: string, to: string): Promise<AgentError | null> {
    const refusal = await onRename(full, to);

    if (!refusal) {
      setEditing(null);
    }

    return refusal;
  }

  function onDragOver(event: DragEvent<HTMLElement>): void {
    if (listing.status !== "read" || !carriesFiles(event)) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setDropping(true);
  }

  function onDragLeave(event: DragEvent<HTMLElement>): void {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setDropping(false);
    }
  }

  function onDropped(event: DragEvent<HTMLElement>): void {
    setDropping(false);

    if (listing.status !== "read" || !carriesFiles(event)) {
      return;
    }

    event.preventDefault();
    onDrop(listing.path, event.dataTransfer.files);
  }

  function modeOf(full: string): RowMode {
    if (editing?.path !== full) {
      return "view";
    }

    return removal?.path === full ? "removing" : editing.mode;
  }

  return (
    <section
      aria-label={t("files.list.label")}
      className="flex h-full min-h-0 flex-col gap-3"
    >
      <header className="flex flex-col gap-2">
        <FileTrail
          crumbs={crumbsOf(path)}
          label={t("files.trail")}
          onBrowse={onBrowse}
          rootLabel={rootLabel}
        />

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Segmented
              label={t("files.sort.label")}
              onChange={onSort}
              options={FILE_SORTS.map((candidate) => ({
                label: t(SORT_KEY[candidate]),
                value: candidate,
              }))}
              value={sort}
            />

            <CheckLine
              checked={hidden}
              label={t("files.hidden.short")}
              name="files.hidden"
              onChange={onHidden}
              size="sm"
            />

            <IconButton
              icon={RefreshCw}
              label={t("files.refresh")}
              onClick={onRefresh}
              size={12}
              variant="discreet"
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <EntryCreate
              disabled={listing.status !== "read"}
              kind="file"
              name="files.newFile"
              onCreate={onMakeFile}
            />

            <EntryCreate
              disabled={listing.status !== "read"}
              kind="dir"
              name="files.newFolder"
              onCreate={onMakeFolder}
            />

            <IconButton
              disabled={listing.status !== "read"}
              icon={Upload}
              label={t("transfers.upload")}
              onClick={() => onUpload(path)}
            />
          </div>
        </div>
      </header>

      {problem ? <ErrorNotice error={problem} onDismiss={onDismiss} /> : null}

      {/** biome-ignore lint/a11y/noNoninteractiveElementInteractions: the drop target is the whole list, and the drop is not a click — the keyboard reaches the same gesture through the Send button above */}
      <section
        aria-label={t("transfers.drop.label")}
        className={`elevation-raised relative min-h-0 flex-1 overflow-y-auto rounded-md border bg-surface transition-fast ${
          dropping ? "border-line-strong border-dashed" : "border-line"
        }`}
        data-dropping={dropping ? "true" : undefined}
        onDragEnter={onDragOver}
        onDragLeave={onDragLeave}
        onDragOver={onDragOver}
        onDrop={onDropped}
      >
        {dropping ? (
          <p
            className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-surface/90 p-6 text-center text-control text-ink"
            role="status"
          >
            {t("transfers.drop", {
              folder: crumbsOf(path).at(-1) ?? rootLabel,
            })}
          </p>
        ) : null}

        {listing.status === "idle" || listing.status === "reading" ? (
          <div className="flex flex-col gap-3 p-3">
            <WaitingLine className="font-data text-small">
              {t("files.list.reading")}
            </WaitingLine>
            <SkeletonRows framed={false} rows={4} />
          </div>
        ) : null}

        {listing.status === "failed" ? (
          <div className="p-3">
            <ErrorNotice
              error={listing.error}
              onRetry={() => onBrowse(listing.path)}
            />
          </div>
        ) : null}

        {listing.status === "read" && entries.length === 0 ? (
          <EmptyState
            detail={
              concealed > 0
                ? t.plural("files.list.concealed", concealed)
                : undefined
            }
            icon={FolderOpen}
            title={t("files.list.empty")}
          />
        ) : null}

        {listing.status === "read" && entries.length > 0 ? (
          <ul
            aria-label={t("files.list.entries")}
            className="divide-y divide-line"
            data-entries={entries.length}
          >
            {entries.map((entry) => {
              const full = under(path, entry.name);

              return (
                <FileRow
                  editors={editors}
                  entry={entry}
                  key={entry.name}
                  mode={modeOf(full)}
                  onAct={(action) => act(entry, full, action)}
                  onCancel={() => {
                    setEditing(null);
                    onDismiss();
                  }}
                  onOpen={() => open(entry, full)}
                  onRemove={(recursive) => onRemove(full, recursive)}
                  onRename={(to) => rename(full, to)}
                  refusal={removal?.path === full ? removal.error : null}
                  selected={selected === full}
                />
              );
            })}
          </ul>
        ) : null}
      </section>

      {listing.status === "read" ? (
        <p className="font-data text-caption text-ink-3 tabular-nums">
          {listing.truncated
            ? t("files.list.truncated", { limit: FILE_LIST_LIMIT })
            : t.plural("files.list.count", entries.length)}
          {concealed > 0
            ? ` · ${t.plural("files.list.concealed", concealed)}`
            : ""}
        </p>
      ) : null}
    </section>
  );
}
