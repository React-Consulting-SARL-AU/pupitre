import { Logo } from "@renderer/components/logo";
import { riseAt } from "@renderer/lib/motion";
import type { ReactNode } from "react";
import { Label } from "./label";
import { WindowBand } from "./window-band";

/**
 * A screen that stands in front of the app: no account yet, no machine yet, a
 * machine that does not answer, a machine that restarts.
 *
 * Every one of them reads the same way — the mark and what the screen is
 * about, a title, one line of consequence, what the screen holds, and the ways
 * forward at its foot — so the reader who meets two of them in a row knows
 * where to look. The cascade reveals them in that order.
 */
export function GateScreen({
  eyebrow,
  title,
  lead,
  children,
  actions,
  actionsAt = 4,
  narrow = false,
  beside = false,
  ...rest
}: {
  eyebrow: string;
  title: string;
  /** What the screen changes for the reader, in one sentence. */
  lead?: string;
  children?: ReactNode;
  /** The ways forward, the main one first. */
  actions?: ReactNode;
  /** Where the actions arrive in the cascade, after what the screen holds. */
  actionsAt?: number;
  narrow?: boolean;
  /** Set beside a panel that already carries the mark on a wide window. */
  beside?: boolean;
} & Record<`data-${string}`, string | undefined>) {
  return (
    <div className="relative grid h-full min-w-0 place-items-center overflow-y-auto bg-base px-8 py-12">
      <WindowBand className="absolute inset-x-0 top-0" />

      <div
        className={`clickable w-full ${narrow ? "max-w-md" : "max-w-xl"}`}
        {...rest}
      >
        <div
          className={`rise flex items-center gap-2.5 ${beside ? "lg:hidden" : ""}`}
          style={riseAt(0)}
        >
          <Logo size={28} />
          <Label>{eyebrow}</Label>
        </div>

        <h1
          className={`rise mt-4 text-balance font-bold font-display text-3xl text-ink leading-tight tracking-tight ${beside ? "lg:mt-0" : ""}`}
          style={riseAt(1)}
        >
          {title}
        </h1>

        {lead ? (
          <p className="rise mt-3 text-ink-3 leading-relaxed" style={riseAt(2)}>
            {lead}
          </p>
        ) : null}

        {children ? (
          <div className="mt-8 flex flex-col gap-4">{children}</div>
        ) : null}

        {actions ? (
          <div
            className="rise mt-8 flex flex-wrap items-center gap-2 border-line border-t pt-6"
            style={riseAt(actionsAt)}
          >
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
}
