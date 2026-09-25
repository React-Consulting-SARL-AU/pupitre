import { Dialog } from "@base-ui-components/react/dialog";
import type { DictionaryKey } from "@renderer/i18n/en";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  filterEntries,
  type PaletteEntry,
  type PaletteKind,
  stepSelection,
} from "@renderer/lib/palette";
import {
  Folder,
  LayoutGrid,
  Search,
  Server as ServerIcon,
  SquareTerminal,
} from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ButtonIcon } from "../ui/button";
import { DIALOG_BACKDROP } from "../ui/dialog";
import { Kbd } from "../ui/kbd";

const ICON: Record<PaletteKind, ButtonIcon> = {
  project: Folder,
  server: ServerIcon,
  terminal: SquareTerminal,
  view: LayoutGrid,
};

const KIND: Record<PaletteKind, DictionaryKey> = {
  project: "palette.kind.project",
  server: "palette.kind.server",
  terminal: "palette.kind.terminal",
  view: "palette.kind.view",
};

export function CommandPalette({
  open,
  entries,
  onPick,
  onClose,
}: {
  open: boolean;
  entries: readonly PaletteEntry[];
  onPick: (entry: PaletteEntry) => void;
  onClose: () => void;
}) {
  const t = useTranslations();

  const [term, setTerm] = useState("");
  const [index, setIndex] = useState(0);
  const listId = useId();

  const shown = useMemo(() => filterEntries(entries, term), [entries, term]);
  const selected = shown[Math.min(index, shown.length - 1)] ?? null;

  // Reset on opening only: a snapshot re-render must not clear the field mid-typing.
  useEffect(() => {
    if (open) {
      setTerm("");
      setIndex(0);
    }
  }, [open]);

  const input = useRef<HTMLInputElement | null>(null);

  function pick(entry: PaletteEntry): void {
    onPick(entry);
    onClose();
  }

  function onKey(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();

      if (selected) {
        pick(selected);
      }

      return;
    }

    const next = stepSelection(index, shown.length, event.key);

    if (
      next !== index ||
      event.key === "ArrowDown" ||
      event.key === "ArrowUp"
    ) {
      event.preventDefault();
      setIndex(next);
    }
  }

  const optionId = (entry: PaletteEntry) =>
    `${listId}-${entry.kind}-${entry.id}`;

  return (
    <Dialog.Root
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      open={open}
    >
      <Dialog.Portal>
        <Dialog.Backdrop className={DIALOG_BACKDROP} />
        <Dialog.Popup
          aria-label={t("palette.title")}
          className="elevation-overlay fixed top-20 left-1/2 flex w-[min(32rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-lg border border-line bg-surface outline-none transition-pop data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          data-command-palette="open"
          initialFocus={input}
        >
          <label className="flex items-center gap-2.5 border-line border-b px-4 py-3">
            <Search
              className="shrink-0 text-ink-3"
              size={15}
              strokeWidth={1.5}
            />
            <span className="sr-only">{t("palette.search")}</span>
            <input
              aria-activedescendant={selected ? optionId(selected) : undefined}
              aria-autocomplete="list"
              aria-controls={listId}
              aria-expanded="true"
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-4"
              onChange={(event) => {
                setTerm(event.target.value);
                setIndex(0);
              }}
              onKeyDown={onKey}
              placeholder={t("palette.placeholder")}
              ref={input}
              role="combobox"
              spellCheck={false}
              type="text"
              value={term}
            />
            <Kbd>{t("palette.escape")}</Kbd>
          </label>

          <div
            aria-label={t("palette.title")}
            className="flex max-h-80 flex-col overflow-y-auto p-1"
            id={listId}
            role="listbox"
          >
            {shown.length === 0 ? (
              <p className="px-3 py-3 text-control text-ink-3">
                {t("palette.empty", { term })}
              </p>
            ) : null}

            {shown.map((entry) => {
              const Icon = ICON[entry.kind];
              const active = entry === selected;

              return (
                <button
                  aria-selected={active}
                  className={`flex w-full items-center gap-2.5 rounded-sm px-2.5 py-2 text-left text-control transition-fast ${
                    active ? "bg-raised text-ink" : "text-ink-2"
                  }`}
                  data-palette-entry={`${entry.kind}:${entry.id}`}
                  id={optionId(entry)}
                  key={optionId(entry)}
                  onClick={() => pick(entry)}
                  onMouseEnter={() => setIndex(shown.indexOf(entry))}
                  role="option"
                  tabIndex={-1}
                  type="button"
                >
                  <Icon
                    aria-hidden="true"
                    className="shrink-0 text-ink-3"
                    size={14}
                    strokeWidth={1.5}
                  />
                  <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                  {entry.hint ? (
                    <span className="shrink-0 truncate font-data text-caption text-ink-3">
                      {entry.hint}
                    </span>
                  ) : null}
                  <span className="label shrink-0 text-ink-3">
                    {t(KIND[entry.kind])}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="sr-only" role="status">
            {t.plural("palette.count", shown.length)}
          </p>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
