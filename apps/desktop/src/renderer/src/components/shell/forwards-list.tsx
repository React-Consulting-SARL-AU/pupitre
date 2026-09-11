import { useTranslations } from "@renderer/i18n/use-translations";
import type { PortForward } from "@shared/services";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import { IconButton } from "../ui/icon-button";
import { Label } from "../ui/label";
import { ForwardRow } from "./forward-row";

/**
 * The forwards drawn, in the same shape as the transfers above them.
 *
 * Every `ssh -L` the app holds is here, whichever panel opened it and
 * whichever server it reaches: a forward is a port of this computer, and the
 * place that lists what this computer is doing is the sidebar. Nothing shows
 * while none is open.
 */
export function ForwardsList({
  forwards,
  nameOf,
  onClose,
}: {
  forwards: readonly PortForward[];
  nameOf: (serverId: string) => string | null;
  onClose: (id: string) => Promise<void>;
}) {
  const t = useTranslations();

  const [folded, setFolded] = useState(false);

  if (forwards.length === 0) {
    return null;
  }

  return (
    <section
      aria-label={t("forwards.panel")}
      className="mx-2 mt-2 flex flex-col rounded-md border border-line bg-base"
      data-forwards={forwards.length}
    >
      <header className="flex items-center gap-2 px-3 pt-2 pb-1">
        <Label>{t("forwards.panel")}</Label>
        <span className="rounded-full border border-line px-1.5 font-data text-[10px] text-ink-3 tabular-nums">
          {t.plural("forwards.panel.count", forwards.length)}
        </span>
        <span className="flex-1" />
        <IconButton
          expanded={!folded}
          icon={folded ? ChevronUp : ChevronDown}
          label={t("forwards.panel.toggle")}
          onClick={() => setFolded((held) => !held)}
          size={12}
          variant="discreet"
        />
      </header>

      {folded ? null : (
        <ul className="flex max-h-60 flex-col divide-y divide-line overflow-y-auto">
          {forwards.map((forward) => (
            <ForwardRow
              forward={forward}
              key={forward.id}
              onClose={() => onClose(forward.id)}
              serverName={nameOf(forward.serverId)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
