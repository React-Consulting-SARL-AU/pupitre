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
      className="flex flex-col gap-1 px-3 py-2"
      data-forward={forward.id}
      data-forward-port={forward.remotePort}
      data-kept={kept ? "true" : "false"}
    >
      <div className="flex items-center gap-2">
        <StatusDot
          shape={forward.reconnecting ? "breathing" : "filled"}
          size={9}
          tone={forward.reconnecting ? "warn" : "ok"}
        />
        <span className="min-w-0 flex-1 truncate text-ink text-small">
          {named}
        </span>
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
          variant="danger"
        />
      </div>

      <p className="pl-4 font-data text-caption text-ink-3 tabular-nums">
        {t("forwards.route", {
          local: forward.localPort,
          remote: forward.remotePort,
        })}
      </p>

      {forward.reconnecting ? (
        <p className="pl-4 text-caption text-warn leading-relaxed">
          {t("forwards.reconnecting")}
        </p>
      ) : null}

      {kept && !forward.reconnecting ? (
        <p className="pl-4 text-caption text-ink-3 leading-relaxed">
          {t("forwards.kept")}
        </p>
      ) : null}

      {forward.movedFrom === undefined ? null : (
        <p className="pl-4 text-caption text-ink-3 leading-relaxed">
          {t("forwards.moved", { from: forward.movedFrom })}
        </p>
      )}
    </li>
  );
}
