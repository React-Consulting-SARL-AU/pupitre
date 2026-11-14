import { useTranslations } from "@renderer/i18n/use-translations";
import { openAddress } from "@renderer/lib/open-address";
import type { AddressLine } from "@renderer/lib/project-addresses";
import type { Gesture } from "@renderer/lib/use-pending";
import type { PortForward } from "@shared/services";
import { Cable, Check, Copy, ExternalLink, Lock, LockOpen } from "lucide-react";
import { useState } from "react";
import { ConfirmDialog } from "../ui/confirm-button";
import { IconButton } from "../ui/icon-button";
import { ProjectAddressForward } from "./project-address-forward";

export function ProjectAddressRow({
  line,
  forward,
  copied,
  onCopy,
  onReach,
  onCloseForward,
  onKeepForward,
  onTurnAccess,
}: {
  line: AddressLine;
  forward: PortForward | null;
  copied: string | null;
  onCopy: (value: string) => void;
  onReach: Gesture;
  onCloseForward: Gesture;
  onKeepForward: Gesture<[boolean]>;
  onTurnAccess: () => Promise<void>;
}) {
  const t = useTranslations();

  const [asking, setAsking] = useState(false);
  const [turning, setTurning] = useState(false);

  const url = line.hostname ? `https://${line.hostname}` : null;
  const openable = url !== null && line.live;
  const shown = url ? url.replace("https://", "") : `${line.host}:${line.port}`;
  const copiedHere = copied === (url ?? shown);
  const gated = url !== null && line.guarded !== null;

  async function turn() {
    setTurning(true);

    try {
      await onTurnAccess();
      setAsking(false);
    } finally {
      setTurning(false);
    }
  }

  return (
    <li
      className="flex flex-col gap-1"
      data-forwarded={forward ? "true" : "false"}
      data-guarded={gated ? String(line.guarded) : undefined}
      data-published={url ? "true" : "false"}
    >
      <div className="flex items-center gap-2">
        <span className="w-20 shrink-0 truncate font-data text-caption text-ink-4 uppercase">
          {line.label}
        </span>

        {openable ? (
          <button
            className="min-w-0 flex-1 truncate text-left font-data text-control text-ink hover:underline"
            onClick={() => openAddress(url)}
            type="button"
          >
            {shown}
          </button>
        ) : (
          <span className="min-w-0 flex-1 truncate font-data text-control text-ink-3">
            {shown}
          </span>
        )}

        {openable ? (
          <IconButton
            icon={ExternalLink}
            label={t("project.addresses.open", { hostname: shown })}
            onClick={() => openAddress(url)}
            variant="discreet"
          />
        ) : null}

        <IconButton
          icon={copiedHere ? Check : Copy}
          label={
            copiedHere
              ? t("project.overview.addressCopied")
              : t("project.overview.copyAddress")
          }
          onClick={() => onCopy(url ?? shown)}
          variant="discreet"
        />

        {gated && line.guarded ? (
          <IconButton
            asks
            icon={Lock}
            label={t("project.addresses.guarded", { hostname: shown })}
            onClick={() => setAsking(true)}
            variant="discreet"
          />
        ) : null}

        {gated && !line.guarded ? (
          <IconButton
            icon={LockOpen}
            label={t("project.addresses.public", { hostname: shown })}
            loading={turning}
            onClick={turn}
            variant="discreet"
          />
        ) : null}

        {forward ? null : (
          <IconButton
            icon={Cable}
            label={t("forwards.reach", { port: line.port })}
            onClick={onReach}
            variant="discreet"
          />
        )}
      </div>

      {forward ? (
        <ProjectAddressForward
          forward={forward}
          onClose={onCloseForward}
          onKeep={onKeepForward}
        />
      ) : null}

      {gated ? (
        <ConfirmDialog
          confirmLabel={t("project.addresses.publicConfirm")}
          onCancel={() => setAsking(false)}
          onConfirm={turn}
          open={asking}
          question={t("project.addresses.publicQuestion", {
            hostname: shown,
            process: line.process,
          })}
          title={t("project.addresses.publicTitle", { hostname: shown })}
          working={turning}
        />
      ) : null}
    </li>
  );
}
