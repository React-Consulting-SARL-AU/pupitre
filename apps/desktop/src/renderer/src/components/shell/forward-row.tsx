import { useTranslations } from "@renderer/i18n/use-translations";
import type { PortForward } from "@shared/services";
import { X } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import { StatusDot } from "../ui/status-dot";

/**
 * One forward of the panel: what it serves, where it answers, and its end.
 *
 * The local address is the thing the reader came for — it is what a database
 * client is pointed at — so it is the line in `font-data`. A forward that did
 * not get its usual port says so here too, where it would be looked for.
 */
export function ForwardRow({
  forward,
  serverName,
  onClose,
}: {
  forward: PortForward;
  /** The server it reaches, for a list that mixes several. */
  serverName: string | null;
  onClose: () => Promise<void>;
}) {
  const t = useTranslations();

  const named = [serverName, forward.label].filter(Boolean).join(" · ");

  return (
    <li
      className="flex flex-col gap-1 px-3 py-2"
      data-forward={forward.id}
      data-forward-port={forward.remotePort}
    >
      <div className="flex items-center gap-2">
        <StatusDot shape="filled" size={9} tone="ok" />
        <span className="min-w-0 flex-1 truncate text-ink text-small">
          {named}
        </span>
        <IconButton
          icon={X}
          label={t("forwards.close", { port: forward.remotePort })}
          onClick={onClose}
          size={11}
          variant="danger"
        />
      </div>

      <p className="pl-4 font-data text-caption text-ink-3 tabular-nums">
        {t("forwards.route", {
          local: forward.localPort,
          remote: forward.remotePort,
        })}
      </p>

      {forward.movedFrom === undefined ? null : (
        <p className="pl-4 text-caption text-ink-3 leading-relaxed">
          {t("forwards.moved", { from: forward.movedFrom })}
        </p>
      )}
    </li>
  );
}
