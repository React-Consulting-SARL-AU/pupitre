import type { Candidate, CandidateKind } from "@shared/completion";

const MARK: Record<CandidateKind, string> = {
  command: "$",
  argument: "·",
  path: "/",
  history: "↺",
};

/** One candidate of the list: its kind as a glyph, its text, its help when it has one. */
export function CompletionListRow({
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
          className={`w-3 shrink-0 text-center font-data text-caption ${
            active ? "text-ink" : "text-ink-3"
          }`}
        >
          {MARK[candidate.kind]}
        </span>
        <span className="min-w-0 flex-1 truncate font-data text-small">
          {candidate.text}
        </span>
        {candidate.help ? (
          <span className="shrink-0 truncate text-caption text-ink-3">
            {candidate.help}
          </span>
        ) : null}
      </button>
    </li>
  );
}
