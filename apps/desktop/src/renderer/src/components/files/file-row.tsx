import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { useTranslations } from "@renderer/i18n/use-translations";
import { entryActions, type FileAction } from "@renderer/lib/file-actions";
import { since, weight } from "@renderer/lib/format";
import type { AgentError } from "@shared/agent";
import type { RemoteEditor } from "@shared/editors";
import { File, Folder, Link2 } from "lucide-react";
import { type MouseEvent, useState } from "react";
import { FileEntryMenu, type MenuPoint } from "./file-entry-menu";
import { FileRemoveConfirm } from "./file-remove-confirm";
import { FileRenameField } from "./file-rename-field";

/** What the row is doing besides showing its entry. */
export type RowMode = "view" | "renaming" | "removing";

const ICON = {
  dir: Folder,
  file: File,
  link: Link2,
} as const;

/**
 * One entry of the folder on screen.
 *
 * Clicking the name opens it — a folder is walked into, a file is shown on
 * the right. Everything else is in the menu, from the button at the end of
 * the row or from a right click on the name, and a rename or a deletion
 * happens in the row itself rather than in a dialog over the list.
 */
export function FileRow({
  entry,
  selected,
  editors,
  mode,
  refusal,
  onOpen,
  onAct,
  onRename,
  onRemove,
  onCancel,
}: {
  entry: FileEntry;
  selected: boolean;
  editors: readonly RemoteEditor[];
  mode: RowMode;
  /** The agent's refusal of the first deletion, when it held a folder back. */
  refusal: AgentError | null;
  onOpen: () => void;
  onAct: (action: FileAction) => void;
  onRename: (to: string) => Promise<void>;
  onRemove: (recursive: boolean) => Promise<void>;
  onCancel: () => void;
}) {
  const t = useTranslations();

  const [open, setOpen] = useState(false);
  const [point, setPoint] = useState<MenuPoint | null>(null);

  const Icon = ICON[entry.kind];
  const modified = Date.parse(entry.modified_at);
  const folder = entry.kind === "dir";

  function onContextMenu(event: MouseEvent<HTMLElement>): void {
    event.preventDefault();
    setPoint(
      event.clientX === 0 && event.clientY === 0
        ? null
        : { x: event.clientX, y: event.clientY }
    );
    setOpen(true);
  }

  return (
    <li
      className={`flex flex-col ${selected ? "bg-raised" : ""}`}
      data-entry={entry.name}
      data-kind={entry.kind}
      data-selected={selected ? "true" : undefined}
    >
      <div className="flex items-center gap-1 pr-1.5">
        {mode === "renaming" ? (
          <FileRenameField
            name={entry.name}
            onCancel={onCancel}
            onRename={onRename}
          />
        ) : (
          <button
            aria-current={selected ? "true" : undefined}
            className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-2.5 text-left transition-fast hover:bg-raised"
            onClick={onOpen}
            onContextMenu={onContextMenu}
            title={
              folder
                ? t("files.row.enter", { name: entry.name })
                : t("files.row.show", { name: entry.name })
            }
            type="button"
          >
            <Icon
              aria-hidden="true"
              className="shrink-0 text-ink-3"
              size={13}
              strokeWidth={1.5}
            />
            <span className="min-w-0 flex-1 truncate font-data text-[12px] text-ink">
              {entry.name}
            </span>
            <span className="w-16 shrink-0 text-right font-data text-[11px] text-ink-3 tabular-nums">
              {folder ? "" : weight(entry.size_bytes)}
            </span>
            <span className="w-20 shrink-0 text-right font-data text-[11px] text-ink-3 tabular-nums">
              {Number.isNaN(modified) ? entry.modified_at : since(modified)}
            </span>
          </button>
        )}

        <FileEntryMenu
          actions={entryActions(entry, editors)}
          entry={entry}
          onAct={onAct}
          onOpenChange={(next) => {
            setOpen(next);

            if (!next) {
              setPoint(null);
            }
          }}
          open={open}
          point={point}
        />
      </div>

      {mode === "removing" ? (
        <FileRemoveConfirm
          entry={entry}
          onCancel={onCancel}
          onRemove={onRemove}
          refusal={refusal}
        />
      ) : null}
    </li>
  );
}
