import { IconButton } from "@renderer/components/ui/icon-button";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { VersionOrder } from "@shared/agent-update";
import { X } from "lucide-react";
import type { ReactNode } from "react";

/**
 * The shell both sides of the banner share: what the gap is, the two versions
 * in the app's data face, and the way to put it away until the next release.
 */
export function AgentUpdateFrame({
  order,
  title,
  detail,
  children,
  onHide,
}: {
  order: VersionOrder;
  title: string;
  detail: string;
  children?: ReactNode;
  onHide?: () => void;
}) {
  const t = useTranslations();

  return (
    <section
      className="elevation-raised flex flex-col gap-3 rounded-md border border-line bg-surface px-4 py-3"
      data-update={order}
    >
      <div className="flex items-start gap-2.5">
        <StatusDot label={title} shape="ringed" size={11} tone="warn" />

        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink">{title}</p>
          <p className="mt-0.5 font-data text-[11px] text-ink-3">{detail}</p>
        </div>

        {onHide ? (
          <IconButton
            icon={X}
            label={t("common.hide")}
            onClick={onHide}
            size={12}
            variant="discreet"
          />
        ) : null}
      </div>

      {children}
    </section>
  );
}
