import { Menu } from "@base-ui-components/react/menu";
import type { FileEntry } from "@pupitre/shared/agent-protocol/files";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { FileAction } from "@renderer/lib/file-actions";
import {
  Copy,
  Download,
  Ellipsis,
  FileText,
  FolderCode,
  FolderOpen,
  Pencil,
  SquareTerminal,
  Trash2,
} from "lucide-react";
import { Fragment } from "react";
import type { ButtonIcon } from "../ui/button";

/** Where a right click landed, so the menu opens under the pointer rather than under the button. */
export interface MenuPoint {
  x: number;
  y: number;
}

const ICON: Record<FileAction["id"], ButtonIcon> = {
  copy: Copy,
  download: Download,
  editor: FolderCode,
  open: FolderOpen,
  remove: Trash2,
  rename: Pencil,
  terminal: SquareTerminal,
};

const ITEM =
  "flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-[13px] text-ink outline-none data-[highlighted]:bg-raised";

function pointAnchor(point: MenuPoint) {
  return {
    getBoundingClientRect: () => new DOMRect(point.x, point.y, 0, 0),
  };
}

/**
 * The menu of one entry, opened from its button or from a right click.
 *
 * One menu serves both: the button is its trigger, and a right click on the
 * row opens the same menu anchored to the pointer. The items come from the
 * entry, so a file never offers a terminal and a folder without editors never
 * offers one.
 */
export function FileEntryMenu({
  entry,
  actions,
  open,
  point,
  onOpenChange,
  onAct,
}: {
  entry: FileEntry;
  actions: readonly FileAction[];
  open: boolean;
  point: MenuPoint | null;
  onOpenChange: (open: boolean) => void;
  onAct: (action: FileAction) => void;
}) {
  const t = useTranslations();

  const label = t("files.menu.label", { name: entry.name });
  const OpenIcon = entry.kind === "dir" ? FolderOpen : FileText;

  function labelOf(action: FileAction): string {
    if (action.id === "editor") {
      return t("files.menu.editor", { editor: action.editor?.name ?? "" });
    }

    return t(`files.menu.${action.id}`);
  }

  return (
    <Menu.Root modal={false} onOpenChange={onOpenChange} open={open}>
      <Menu.Trigger
        aria-label={label}
        className="clickable inline-flex shrink-0 items-center justify-center rounded-sm border border-transparent p-1.5 text-ink-4 transition-soft hover:bg-raised hover:text-ink data-[popup-open]:bg-raised data-[popup-open]:text-ink"
        data-entry-menu={entry.name}
        title={label}
      >
        <Ellipsis size={13} strokeWidth={1.5} />
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Positioner
          align={point ? "start" : "end"}
          anchor={point ? pointAnchor(point) : undefined}
          side="bottom"
          sideOffset={4}
        >
          <Menu.Popup
            aria-label={label}
            className="elevation-overlay z-50 min-w-48 rounded-md border border-line bg-surface p-1 outline-none"
          >
            {actions.map((action) => {
              const Icon = action.id === "open" ? OpenIcon : ICON[action.id];
              const key = action.editor
                ? `editor-${action.editor.id}`
                : action.id;

              return (
                <Fragment key={key}>
                  {action.id === "remove" ? (
                    <Menu.Separator className="my-1 h-px bg-line" />
                  ) : null}
                  <Menu.Item
                    className={`${ITEM} ${action.id === "remove" ? "data-[highlighted]:text-danger" : ""}`}
                    data-action={key}
                    onClick={() => onAct(action)}
                  >
                    <Icon
                      aria-hidden="true"
                      className="shrink-0 text-ink-3"
                      size={13}
                      strokeWidth={1.5}
                    />
                    {labelOf(action)}
                  </Menu.Item>
                </Fragment>
              );
            })}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
