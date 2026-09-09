import { useElapsed } from "@renderer/lib/use-elapsed";
import type { ReactNode } from "react";
import { humanMs } from "../../lib/duration";
import { Details } from "./details";
import { StatusDot } from "./status-dot";

/**
 * A wait that says what is happening, where it is, and how long it has taken.
 *
 * `detail` says what is happening in the reader's own words, and `note` how
 * the app goes about it — folded under Details, closed, for whoever wants it:
 * a spinner alone would leave the reader with nothing but the fact that
 * something is slow, and the how in plain sight would leave them a manual. `phases` goes further where the app actually knows —
 * the shapes then carry the progress, a done phase full, the current one
 * breathing, what is ahead hollow, exactly as the rail of the onboarding does.
 *
 * The elapsed time only appears once the wait has become one: under a couple of
 * seconds a counter would flash and say nothing.
 */

export type WaitingPhaseState = "done" | "running" | "ahead";

export interface WaitingPhase {
  id: string;
  label: string;
  state: WaitingPhaseState;
}

const SHAPE = {
  ahead: "empty",
  done: "filled",
  running: "breathing",
} as const;

const TONE = {
  ahead: "text-ink-4",
  done: "text-ink-3",
  running: "text-ink",
} as const;

const COUNTED_FROM_MS = 2000;

export function WaitingNotice({
  title,
  detail,
  note,
  phases,
}: {
  title: string;
  detail?: ReactNode;
  note?: ReactNode;
  /** The named steps of the wait, when the app knows them. */
  phases?: readonly WaitingPhase[];
}) {
  const elapsed = useElapsed(true);

  return (
    <div
      aria-busy="true"
      className="elevation-raised rounded-md border border-line bg-surface px-4 py-4"
    >
      <div className="flex items-start gap-3">
        <span className="translate-y-1">
          <StatusDot shape="breathing" size={12} />
        </span>

        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{title}</p>
          {detail ? (
            <p className="mt-1 text-ink-3 leading-relaxed">{detail}</p>
          ) : null}
        </div>

        {elapsed >= COUNTED_FROM_MS ? (
          <span className="shrink-0 font-data text-[12px] text-ink-3 tabular-nums">
            {humanMs(elapsed)}
          </span>
        ) : null}
      </div>

      {phases && phases.length > 0 ? (
        <ol className="mt-4 flex flex-col border-line border-t pt-3">
          {phases.map((phase) => (
            <li
              aria-current={phase.state === "running" ? "step" : undefined}
              className="flex items-center gap-2.5 py-1"
              data-phase={phase.id}
              data-state={phase.state}
              key={phase.id}
            >
              <StatusDot shape={SHAPE[phase.state]} size={9} />
              <span
                className={`min-w-0 flex-1 truncate text-[12px] transition-soft ${TONE[phase.state]} ${phase.state === "running" ? "font-medium" : ""}`}
              >
                {phase.label}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {note ? <Details className="mt-3">{note}</Details> : null}
    </div>
  );
}
