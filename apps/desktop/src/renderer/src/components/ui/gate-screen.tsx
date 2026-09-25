import { Logo } from "@renderer/components/logo";
import { riseAt } from "@renderer/lib/motion";
import type { ReactNode } from "react";
import { Label } from "./label";
import { WindowBand } from "./window-band";

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
  lead?: string;
  children?: ReactNode;
  actions?: ReactNode;
  /** Cascade index of the actions, after whatever rises inside `children`. */
  actionsAt?: number;
  narrow?: boolean;
  /** Next to a panel that already shows the mark on a wide window. */
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
