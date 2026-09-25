import { IconButton } from "@renderer/components/ui/icon-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useTerminalStatus } from "@renderer/lib/terminal-status";
import { clearFind, find, focus } from "@renderer/lib/terminals";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/**
 * A search laid over the terminal, that never writes into it.
 *
 * Typing looks as you type and grows the selection with the word; Enter goes
 * to the next occurrence, Shift+Enter to the previous one, Escape hands the
 * keyboard back to the session. The count comes from xterm itself.
 */
export function TerminalSearchBar({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const t = useTranslations();

  const [term, setTerm] = useState("");
  const input = useRef<HTMLInputElement | null>(null);
  const matches = useTerminalStatus(id).matches;

  useEffect(() => {
    input.current?.focus();

    return () => clearFind(id);
  }, [id]);

  function change(next: string): void {
    setTerm(next);

    if (next.length > 0) {
      find(id, next, "next", true);
    } else {
      clearFind(id);
    }
  }

  function close(): void {
    onClose();
    focus(id);
  }

  let count: string | null = null;

  if (matches && term.length > 0) {
    count =
      matches.count === 0
        ? t("terminals.search.none")
        : t("terminals.search.count", {
            count: matches.count,
            index: Math.max(1, matches.index + 1),
          });
  }

  return (
    <search
      className="elevation-overlay absolute top-2 right-3 z-10 flex items-center gap-0.5 rounded-md border border-line bg-surface p-1"
      data-search={id}
    >
      <input
        aria-label={t("terminals.search.placeholder")}
        autoComplete="off"
        className="w-52 bg-transparent px-2 py-1 font-data text-ink text-small outline-none placeholder:text-ink-4"
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            find(id, term, event.shiftKey ? "previous" : "next");
          }

          if (event.key === "Escape") {
            event.preventDefault();
            close();
          }
        }}
        placeholder={t("terminals.search.placeholder")}
        ref={input}
        spellCheck={false}
        value={term}
      />

      {count ? (
        <span className="shrink-0 px-1.5 font-data text-caption text-ink-3 tabular-nums">
          {count}
        </span>
      ) : null}

      <IconButton
        disabled={term.length === 0}
        icon={ChevronUp}
        label={t("terminals.search.previous")}
        onClick={() => find(id, term, "previous")}
        size={12}
        variant="discreet"
      />
      <IconButton
        disabled={term.length === 0}
        icon={ChevronDown}
        label={t("terminals.search.next")}
        onClick={() => find(id, term, "next")}
        size={12}
        variant="discreet"
      />
      <IconButton
        icon={X}
        label={t("terminals.search.close")}
        onClick={close}
        size={12}
        variant="discreet"
      />
    </search>
  );
}
