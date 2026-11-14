import { ContextMenu } from "@base-ui-components/react/context-menu";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import { isMac } from "@renderer/lib/platform";
import { chordLabel } from "@renderer/lib/terminal-shortcuts";
import {
  clearScreen,
  copySelection,
  copyWholeOutput,
  focus,
  hasSelection,
  paste,
  selectAll,
  tracksMouse,
} from "@renderer/lib/terminals";
import { useTerminals } from "@renderer/stores/terminals";
import {
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  Eraser,
  type LucideIcon,
  Search,
  TextSelect,
} from "lucide-react";
import { Fragment, type ReactElement, useState } from "react";

type Action = "copy" | "paste" | "selectAll" | "search" | "copyAll" | "clear";

interface Entry {
  action: Action;
  icon: LucideIcon;
  label: DictionaryKey;
  key?: string;
  startsGroup?: boolean;
}

const ENTRIES: readonly Entry[] = [
  { action: "copy", icon: Copy, key: "C", label: "terminals.menu.copy" },
  {
    action: "paste",
    icon: ClipboardPaste,
    key: "V",
    label: "terminals.menu.paste",
  },
  { action: "selectAll", icon: TextSelect, label: "terminals.menu.selectAll" },
  {
    action: "search",
    icon: Search,
    key: "F",
    label: "terminals.menu.search",
    startsGroup: true,
  },
  { action: "copyAll", icon: ClipboardCopy, label: "terminals.status.copyAll" },
  {
    action: "clear",
    icon: Eraser,
    key: "K",
    label: "terminals.menu.clear",
    startsGroup: true,
  },
];

const ITEM =
  "flex cursor-default select-none items-center gap-2.5 rounded-sm px-2.5 py-1.5 text-control text-ink outline-none data-[disabled]:text-ink-4 data-[highlighted]:bg-raised";

function run(id: string, action: Action): void {
  switch (action) {
    case "copy":
      copySelection(id);
      break;
    case "paste":
      paste(id);
      break;
    case "selectAll":
      selectAll(id);
      break;
    case "search":
      useTerminals.getState().openSearch(id);
      return;
    case "copyAll":
      copyWholeOutput(id);
      break;
    default:
      clearScreen(id);
  }

  focus(id);
}

/** `children` is the element xterm lives in: the menu opens where it is right-clicked. */
export function TerminalContextMenu({
  id,
  children,
}: {
  id: string;
  children: ReactElement<Record<string, unknown>>;
}) {
  const t = useTranslations();

  const [selected, setSelected] = useState(false);
  const chord = chordLabel(isMac);

  function onContextMenu(
    event: Parameters<
      NonNullable<ContextMenu.Trigger.Props["onContextMenu"]>
    >[0]
  ): void {
    if (tracksMouse(id) && !event.altKey) {
      event.preventBaseUIHandler();
      return;
    }

    setSelected(hasSelection(id));
  }

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger
        data-terminal-menu-area={id}
        onContextMenu={onContextMenu}
        render={children}
      />

      <ContextMenu.Portal>
        <ContextMenu.Positioner className="z-50">
          <ContextMenu.Popup
            aria-label={t("terminals.menu.label")}
            className="elevation-overlay min-w-52 rounded-md border border-line bg-surface p-1 outline-none"
            data-terminal-menu={id}
          >
            {ENTRIES.map(({ action, icon: Icon, label, key, startsGroup }) => (
              <Fragment key={action}>
                {startsGroup ? (
                  <ContextMenu.Separator className="my-1 h-px bg-line" />
                ) : null}
                <ContextMenu.Item
                  className={ITEM}
                  data-action={action}
                  disabled={action === "copy" && !selected}
                  onClick={() => run(id, action)}
                >
                  <Icon
                    aria-hidden="true"
                    className="shrink-0 text-ink-3"
                    size={13}
                    strokeWidth={1.5}
                  />
                  <span className="flex-1">{t(label)}</span>
                  {key ? (
                    <span className="font-data text-caption text-ink-4">
                      {chord}
                      {key}
                    </span>
                  ) : null}
                </ContextMenu.Item>
              </Fragment>
            ))}
          </ContextMenu.Popup>
        </ContextMenu.Positioner>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}
