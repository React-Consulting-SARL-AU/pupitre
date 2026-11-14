import { useTranslations } from "@renderer/i18n/use-translations";
import type { Gesture } from "@renderer/lib/use-pending";
import type { PortForward } from "@shared/services";
import { Pin, X } from "lucide-react";
import { IconButton } from "../ui/icon-button";
import { StatusDot } from "../ui/status-dot";

/** The `ssh -L` that brings this port to the owner's computer. */
export function ProjectAddressForward({
  forward,
  onClose,
  onKeep,
}: {
  forward: PortForward;
  onClose: Gesture;
  onKeep: Gesture<[boolean]>;
}) {
  const t = useTranslations();

  const kept = forward.kept === true;

  return (
    <div
      className="flex items-center gap-2 pl-22"
      data-forward={forward.id}
      data-kept={kept ? "true" : "false"}
    >
      <StatusDot
        shape={forward.reconnecting ? "breathing" : "filled"}
        size={8}
        tone={forward.reconnecting ? "warn" : "ok"}
      />
      <span className="text-caption text-ink-3">{t("forwards.here")}</span>
      <span className="min-w-0 flex-1 truncate font-data text-ink-2 text-small tabular-nums">
        127.0.0.1:{forward.localPort}
        {forward.reconnecting ? ` · ${t("forwards.reconnecting")}` : ""}
      </span>
      <IconButton
        icon={Pin}
        label={t(kept ? "forwards.unkeep" : "forwards.keep", {
          port: forward.remotePort,
        })}
        onClick={() => onKeep(!kept)}
        pressed={kept}
        variant="discreet"
      />
      <IconButton
        icon={X}
        label={t("forwards.close", { port: forward.remotePort })}
        onClick={onClose}
        variant="discreet"
      />
    </div>
  );
}
