import { useTranslations } from "@renderer/i18n/use-translations";
import { looksLikeCommand } from "@renderer/lib/remedy";
import {
  CircleCheck,
  Info,
  OctagonAlert,
  TriangleAlert,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ButtonIcon } from "./button";
import { IconButton } from "./icon-button";

export type CalloutTone = "info" | "ok" | "warn" | "danger";

/**
 * Each tone carries its own glyph — circle, check, triangle, octagon — so the
 * four stay apart when the colour is gone. The colour is on the glyph alone:
 * a whole card painted red shouts, and the words in it are what has to be read.
 */
const LOOK: Record<CalloutTone, { icon: ButtonIcon; glyph: string }> = {
  info: { icon: Info, glyph: "text-ink-3" },
  ok: { icon: CircleCheck, glyph: "text-ok" },
  warn: { icon: TriangleAlert, glyph: "text-warn" },
  danger: { icon: OctagonAlert, glyph: "text-danger" },
};

/** The remedy: a line to type stays a line to type, a sentence stays a sentence. */
function CalloutFix({ fix }: { fix: string }) {
  if (looksLikeCommand(fix)) {
    return (
      <code className="mt-2 inline-block max-w-full break-all rounded-sm bg-sunken px-2 py-1 font-data text-[12px] text-ink-2">
        {fix}
      </code>
    );
  }

  return <p className="mt-1 text-[12px] text-ink-2 leading-relaxed">{fix}</p>;
}

export function Callout({
  tone = "info",
  children,
  fix,
  action,
  onDismiss,
  name,
}: {
  tone?: CalloutTone;
  children: ReactNode;
  /** The remedy, printed exactly as the server phrased it. */
  fix?: string;
  action?: ReactNode;
  /** The card can be put away: the message was read, and the screen moves on. */
  onDismiss?: () => void;
  /** What this card is about, for whoever has to find it. */
  name?: string;
}) {
  const t = useTranslations();

  const look = LOOK[tone];
  const Icon = look.icon;

  return (
    <div
      className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-3.5 py-3"
      data-callout={name}
      data-tone={tone}
      role={tone === "danger" ? "alert" : "status"}
    >
      <Icon
        className={`mt-0.5 shrink-0 ${look.glyph}`}
        size={14}
        strokeWidth={1.5}
      />

      <div className="min-w-0 flex-1">
        <p className="break-words font-medium text-[13px] text-ink leading-relaxed">
          {children}
        </p>
        {fix ? <CalloutFix fix={fix} /> : null}
      </div>

      {action || onDismiss ? (
        <div className="flex shrink-0 items-center gap-1">
          {action}
          {onDismiss ? (
            <IconButton
              icon={X}
              label={t("common.hide")}
              onClick={onDismiss}
              size={12}
              variant="discreet"
            />
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
