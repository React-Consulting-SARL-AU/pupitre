import type { Shot } from "@pupitre/shared/agent-protocol/processes";
import { Skeleton } from "@renderer/components/ui/skeleton";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useFirstSight } from "@renderer/lib/use-first-sight";
import type { ThumbnailState } from "@renderer/stores/shots";
import { ImageOff } from "lucide-react";
import { useEffect, useRef } from "react";

export function ShotStripItem({
  shot,
  thumbnail,
  active,
  onVisible,
  onShow,
}: {
  shot: Shot;
  thumbnail: ThumbnailState | undefined;
  active: boolean;
  onVisible: () => void;
  onShow: () => Promise<void>;
}) {
  const t = useTranslations();

  const frame = useRef<HTMLButtonElement | null>(null);

  useFirstSight(frame, shot.path, onVisible);

  useEffect(() => {
    if (active) {
      frame.current?.scrollIntoView?.({ block: "nearest", inline: "center" });
    }
  }, [active]);

  return (
    <Tooltip label={shot.name}>
      <button
        aria-current={active ? "true" : undefined}
        aria-label={t("shots.viewNamed", { name: shot.name })}
        className={`clickable relative h-14 w-24 shrink-0 overflow-hidden rounded-sm border bg-sunken ${
          active ? "border-ink" : "border-line opacity-60 hover:opacity-100"
        }`}
        data-shot-strip={shot.path}
        onClick={onShow}
        ref={frame}
        type="button"
      >
        {thumbnail?.status === "ready" ? (
          <img
            alt=""
            className="h-full w-full object-cover"
            height={56}
            src={thumbnail.url}
            width={96}
          />
        ) : null}

        {thumbnail?.status === "failed" ? (
          <span className="flex h-full w-full items-center justify-center text-ink-3">
            <ImageOff aria-hidden="true" size={14} strokeWidth={1.5} />
          </span>
        ) : null}

        {!thumbnail || thumbnail.status === "reading" ? (
          <Skeleton className="h-full w-full rounded-none" />
        ) : null}
      </button>
    </Tooltip>
  );
}
