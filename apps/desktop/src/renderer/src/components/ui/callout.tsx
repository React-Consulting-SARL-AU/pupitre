import { Info, OctagonAlert, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import type { ButtonIcon } from "./button";

export type CalloutTone = "info" | "warn" | "danger";

/**
 * Each tone carries its own glyph — circle, triangle, octagon — so the three
 * stay apart when the colour is gone.
 */
const LOOK: Record<CalloutTone, { icon: ButtonIcon; frame: string }> = {
  info: { icon: Info, frame: "border-line bg-surface text-ink-2" },
  warn: { icon: TriangleAlert, frame: "border-warn/40 bg-warn/10 text-warn" },
  danger: {
    icon: OctagonAlert,
    frame: "border-danger/40 bg-danger/10 text-danger",
  },
};

export function Callout({
  tone = "info",
  children,
  fix,
  action,
}: {
  tone?: CalloutTone;
  children: ReactNode;
  /** The remedy, printed exactly as the server phrased it. */
  fix?: string;
  action?: ReactNode;
}) {
  const look = LOOK[tone];
  const Icon = look.icon;

  return (
    <div
      className={`flex items-start gap-2 rounded-md border px-3 py-2 text-[11px] ${look.frame}`}
      data-tone={tone}
    >
      <Icon className="mt-px shrink-0" size={13} strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="break-words">{children}</p>
        {fix ? (
          <code className="mt-1 block font-data text-ink-3">{fix}</code>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
