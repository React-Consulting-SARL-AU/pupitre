import type { ReactNode } from "react";
import { StatusDot } from "./status-dot";

/**
 * A wait that says what is happening.
 *
 * `detail` names what is being read right now, and `note` what the wait costs
 * the machine: a spinner alone would leave the reader with nothing but the fact
 * that something is slow.
 */
export function WaitingNotice({
  title,
  detail,
  note,
}: {
  title: string;
  detail?: ReactNode;
  note?: ReactNode;
}) {
  return (
    <div
      aria-busy="true"
      className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4"
    >
      <StatusDot shape="breathing" size={12} />
      <div className="min-w-0">
        <p className="font-medium text-ink">{title}</p>
        {detail ? (
          <p className="mt-1 text-ink-3 leading-relaxed">{detail}</p>
        ) : null}
        {note ? (
          <p className="mt-2 text-[11px] text-ink-4 leading-relaxed">{note}</p>
        ) : null}
      </div>
    </div>
  );
}
