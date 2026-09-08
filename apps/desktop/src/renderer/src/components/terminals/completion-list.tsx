import { useTranslations } from "@renderer/i18n/use-translations";
import { accept, TERMINAL_FONT, useCompletion } from "@renderer/lib/completion";
import type { Candidate, CandidateKind } from "@shared/completion";
import type { RefObject } from "react";

const MARK: Record<CandidateKind, string> = {
  command: "$",
  argument: "·",
  path: "/",
  history: "↺",
};

const LIST_HEIGHT = 260;

interface Props {
  id: string;
  /** The frame the list is placed in: the one holding the terminal. */
  frame: RefObject<HTMLDivElement | null>;
}

/**
 * The grey suggestion and the list, laid over the terminal.
 *
 * Nothing here touches the terminal: we read a cursor position and write into
 * the PTY when a candidate is accepted, exactly as if the keystroke came from
 * the keyboard. The terminal does not know a list is open above it.
 */
export function CompletionList({ id, frame }: Props) {
  const t = useTranslations();

  const state = useCompletion(id);
  const box = frame.current?.getBoundingClientRect();
  if (!(state.cursor && box) || state.closed) {
    return null;
  }

  const { cursor } = state;
  const left = cursor.x - box.left;
  const top = cursor.y - box.top;
  const flipUp = top + cursor.height + LIST_HEIGHT > box.height;
  const hasList = state.candidates.length > 0;

  return (
    <>
      {state.ghost ? (
        <span
          aria-hidden
          className="pointer-events-none absolute whitespace-pre text-ink-4"
          style={{
            left,
            top,
            height: cursor.height,
            lineHeight: `${cursor.height}px`,
            fontFamily: TERMINAL_FONT,
            fontSize: 13,
          }}
        >
          {state.ghost}
        </span>
      ) : null}

      {hasList ? (
        <div
          className="fade-in elevation-overlay absolute z-10 min-w-[16rem] max-w-[36rem] overflow-hidden rounded-md border border-line bg-raised"
          role="listbox"
          style={{
            left: Math.max(0, Math.min(left, box.width - 260)),
            ...(flipUp
              ? { bottom: box.height - top + 4 }
              : { top: top + cursor.height + 4 }),
          }}
        >
          <ul className="max-h-[220px] overflow-y-auto py-1">
            {state.candidates.map((candidate, i) => (
              <Row
                active={i === state.selection}
                candidate={candidate}
                key={`${candidate.kind}:${candidate.text}`}
                onChoose={() => accept(id, candidate)}
              />
            ))}
          </ul>
          <div className="flex gap-3 border-line border-t px-3 py-1 font-data text-[11px] text-ink-3">
            <span>{t("terminals.completeHint")}</span>
            <span>{t("terminals.chooseHint")}</span>
            <span>{t("terminals.closeHint")}</span>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({
  candidate,
  active,
  onChoose,
}: {
  candidate: Candidate;
  active: boolean;
  onChoose: () => void;
}) {
  return (
    <li>
      <button
        aria-selected={active}
        className={`flex w-full items-center gap-2.5 px-3 py-1 text-left transition-soft ${
          active
            ? "bg-sunken font-medium text-ink"
            : "text-ink-2 hover:bg-sunken"
        }`}
        onMouseDown={(e) => {
          e.preventDefault();
          onChoose();
        }}
        role="option"
        type="button"
      >
        <span
          className={`w-3 shrink-0 text-center font-data text-[11px] ${
            active ? "text-ink" : "text-ink-3"
          }`}
        >
          {MARK[candidate.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate font-data text-[12.5px]">
          {candidate.text}
        </span>
        {candidate.help ? (
          <span className="shrink-0 truncate text-[11.5px] text-ink-3">
            {candidate.help}
          </span>
        ) : null}
      </button>
    </li>
  );
}
