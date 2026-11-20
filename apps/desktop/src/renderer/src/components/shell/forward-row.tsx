import { useTranslations } from "@renderer/i18n/use-translations";
import type { PortForward } from "@shared/services";
import { Pin, X } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import { StatusDot } from "../ui/status-dot";

export function ForwardRow({
  forward,
  serverName,
  onClose,
  onKeep,
}: {
  forward: PortForward;
  serverName: string | null;
  onClose: () => Promise<void>;
  onKeep: (keep: boolean) => Promise<void>;
}) {
  const t = useTranslations();

  const named = [serverName, forward.label].filter(Boolean).join(" · ");
  const kept = forward.kept === true;

  return (
    <li
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-0.5 py-1.5 pr-1.5 pl-3"
      data-forward={forward.id}
      data-forward-port={forward.remotePort}
      data-kept={kept ? "true" : "false"}
    >
      <StatusDot
        shape={forward.reconnecting ? "breathing" : "filled"}
        size={9}
        tone={forward.reconnecting ? "warn" : "ok"}
      />

      <span className="truncate text-ink text-small">{named}</span>

      <div className="flex items-center">
        <IconButton
          icon={Pin}
          label={t(kept ? "forwards.unkeep" : "forwards.keep", {
            port: forward.remotePort,
          })}
          onClick={() => onKeep(!kept)}
          pressed={kept}
          size={11}
          variant="discreet"
        />
        <IconButton
          icon={X}
          label={t("forwards.close", { port: forward.remotePort })}
          onClick={onClose}
          size={11}
          variant="discreet"
        />
      </div>

      <span className="col-span-2 col-start-2 truncate pr-1.5 font-data text-caption text-ink-3 tabular-nums">
        {forward.localPort === forward.remotePort
          ? t("forwards.address", { port: forward.localPort })
          : t("forwards.route", {
              local: forward.localPort,
              remote: forward.remotePort,
            })}
      </span>

      {forward.reconnecting ? (
        <p className="col-span-2 col-start-2 pr-1.5 text-caption text-warn leading-relaxed">
          {t("forwards.reconnecting")}
        </p>
      ) : null}

      {forward.movedFrom === undefined ? null : (
        <p className="col-span-2 col-start-2 pr-1.5 text-caption text-ink-3 leading-relaxed">
          {t("forwards.moved", { from: forward.movedFrom })}
        </p>
      )}
    </li>
  );
}
