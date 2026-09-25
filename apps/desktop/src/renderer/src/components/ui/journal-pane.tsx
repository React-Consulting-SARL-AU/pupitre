import { useTranslations } from "@renderer/i18n/use-translations";
import { piecesOf } from "@renderer/lib/addresses";
import { clock } from "@renderer/lib/format";
import {
  type JournalMark,
  type JournalRow,
  markOf,
} from "@renderer/lib/journal-buffer";
import { Play, RotateCcw, Square } from "lucide-react";
import {
  memo,
  type PointerEvent,
  type ReactNode,
  type UIEvent,
  useEffect,
  useRef,
} from "react";

/** Closer than this to the bottom, in pixels, counts as reading the tail. */
const TAIL_REACH = 40;

const MARK_ICON = {
  up: Play,
  restart: RotateCcw,
  down: Square,
};

/**
 * The rows of a journal, read as a terminal would have shown them.
 *
 * The pane follows the tail until the reader takes hold of it: scrolling up,
 * or pressing on a line to select it, lets the tail go, and scrolling back to
 * the bottom hooks it again, so a selection never runs away from the pointer.
 * The text is selectable as one block and copies line by line. An address
 * reads as a link; a start or stop the agent wrote into the journal reads as
 * a rule across the pane rather than as a line among the others, and the
 * empty line the agent puts before it folds into the rule.
 */
export function JournalPane({
  rows,
  follow,
  onFollowChange,
  label,
  className = "",
  children,
}: {
  rows: readonly JournalRow[];
  follow: boolean;
  onFollowChange: (next: boolean) => void;
  label: string;
  className?: string;
  /** What reads above the rows: a cut notice, a wait, an empty search. */
  children?: ReactNode;
}) {
  const box = useRef<HTMLDivElement | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: every new snapshot of the rows is a reason to follow — the rows are the signal, not a value read
  useEffect(() => {
    const element = box.current;

    if (follow && element) {
      element.scrollTop = element.scrollHeight;
    }
  }, [follow, rows]);

  function onScroll(event: UIEvent<HTMLDivElement>): void {
    const element = event.currentTarget;
    const atTail =
      element.scrollHeight - element.scrollTop - element.clientHeight <
      TAIL_REACH;

    if (atTail !== follow) {
      onFollowChange(atTail);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>): void {
    const onLink = (event.target as HTMLElement).closest("a") !== null;

    if (follow && !onLink) {
      onFollowChange(false);
    }
  }

  let started = false;

  return (
    <div
      aria-label={label}
      aria-live="off"
      className={`cursor-text select-text overflow-auto bg-sunken px-4 py-3 font-data text-ink-2 text-small leading-[1.7] ${className}`}
      onPointerDown={onPointerDown}
      onScroll={onScroll}
      ref={box}
      role="log"
    >
      {children}

      {rows.map((row, index) => {
        const mark = markOf(row.text);

        if (!mark) {
          const beforeMark =
            row.text === "" && markOf(rows[index + 1]?.text ?? "") !== null;

          return beforeMark ? null : (
            <JournalLine key={row.id} text={row.text} />
          );
        }

        const kind = mark.kind === "up" && started ? "restart" : mark.kind;
        started = started || mark.kind === "up";

        return <JournalRule at={mark.at} key={row.id} kind={kind} />;
      })}
    </div>
  );
}

const JournalLine = memo(function JournalLine({ text }: { text: string }) {
  return (
    <div className="min-h-[1lh] whitespace-pre-wrap break-words">
      {piecesOf(text).map((piece, index) =>
        piece.kind === "address" ? (
          <a
            className="underline decoration-ink-4 underline-offset-2 transition-fast hover:text-ink hover:decoration-ink"
            href={piece.text}
            // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of a line have no identity beyond their place in it
            key={index}
            onClick={(event) => {
              event.preventDefault();
              window.pupitre.openUrl(piece.text);
            }}
            rel="noreferrer"
            target="_blank"
          >
            {piece.text}
          </a>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the pieces of a line have no identity beyond their place in it
          <span key={index}>{piece.text}</span>
        )
      )}
    </div>
  );
});

function JournalRule({
  kind,
  at,
}: {
  kind: JournalMark["kind"] | "restart";
  at: string;
}) {
  const t = useTranslations();
  const Icon = MARK_ICON[kind];

  return (
    <div
      className="my-2 flex select-none items-center gap-3 text-ink"
      data-journal-mark={kind}
    >
      <span aria-hidden="true" className="h-px flex-1 bg-line-strong" />
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-caption">
        <Icon aria-hidden="true" size={11} strokeWidth={1.5} />
        {t(`ui.journal.${kind}`, { time: clock(at) })}
      </span>
      <span aria-hidden="true" className="h-px flex-1 bg-line-strong" />
    </div>
  );
}
