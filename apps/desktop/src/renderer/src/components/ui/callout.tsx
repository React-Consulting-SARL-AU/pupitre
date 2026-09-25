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

// Each tone has its own glyph so the four stay apart without colour; only the glyph is tinted.
const LOOK: Record<CalloutTone, { icon: ButtonIcon; glyph: string }> = {
  info: { icon: Info, glyph: "text-ink-3" },
  ok: { icon: CircleCheck, glyph: "text-ok" },
  warn: { icon: TriangleAlert, glyph: "text-warn" },
  danger: { icon: OctagonAlert, glyph: "text-danger" },
};

function CalloutFix({ fix }: { fix: string }) {
  if (looksLikeCommand(fix)) {
    return (
      <code className="mt-2 inline-block max-w-full break-all rounded-sm bg-sunken px-2 py-1 font-data text-ink-2 text-small">
        {fix}
      </code>
    );
  }

  return <p className="mt-1 text-ink-2 text-small leading-relaxed">{fix}</p>;
}

const FRAMED =
  "elevation-raised rounded-md border border-line bg-surface px-3.5 py-3";

export function Callout({
  tone = "info",
  children,
  fix,
  action,
  onDismiss,
  name,
  bare = false,
}: {
  tone?: CalloutTone;
  children: ReactNode;
  fix?: string;
  action?: ReactNode;
  onDismiss?: () => void;
  name?: string;
  /** Inside a Panel, which already draws the frame. */
  bare?: boolean;
}) {
  const t = useTranslations();

  const look = LOOK[tone];
  const Icon = look.icon;

  return (
    <div
      className={`flex items-start gap-3 ${bare ? "" : FRAMED}`}
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
        <p className="break-words font-medium text-control text-ink leading-relaxed">
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
