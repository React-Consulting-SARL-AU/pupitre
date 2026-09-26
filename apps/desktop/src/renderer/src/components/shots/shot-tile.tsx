import type { Shot } from "@pupitre/shared/agent-protocol/processes";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Skeleton } from "@renderer/components/ui/skeleton";
import { Tooltip } from "@renderer/components/ui/tooltip";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { since, weight } from "@renderer/lib/format";
import { useFirstSight } from "@renderer/lib/use-first-sight";
import type { ThumbnailState } from "@renderer/stores/shots";
import { ImageOff, Trash2 } from "lucide-react";
import { useRef } from "react";

const THUMBNAIL_SIZE = { height: 200, width: 320 };

export function ShotTile({
  shot,
  folder,
  thumbnail,
  shown,
  removing,
  onVisible,
  onShow,
  onRemove,
}: {
  shot: Shot;
  folder: string | null;
  thumbnail: ThumbnailState | undefined;
  shown: boolean;
  removing: boolean;
  onVisible: () => void;
  onShow: () => void;
  onRemove: () => Promise<void>;
}) {
  const t = useTranslations();

  const frame = useRef<HTMLElement | null>(null);

  // Bytes are read only once the tile scrolls into view: one agent channel serves the whole gallery.
  useFirstSight(frame, shot.path, onVisible);

  const taken = Date.parse(shot.created_at);

  return (
    <figure
      className={`elevation-raised flex flex-col overflow-hidden rounded-md border bg-surface ${
        shown ? "border-ink" : "border-line"
      }`}
      data-shot={shot.path}
      data-shown={shown ? "true" : "false"}
      ref={frame}
    >
      <Tooltip label={t("shots.viewNamed", { name: shot.name })}>
        <button
          aria-label={t("shots.viewNamed", { name: shot.name })}
          className="clickable relative aspect-[16/10] w-full overflow-hidden bg-sunken"
          onClick={onShow}
          type="button"
        >
          {thumbnail?.status === "ready" ? (
            <img
              alt={t("shots.alt", { name: shot.name })}
              className="h-full w-full object-cover"
              height={THUMBNAIL_SIZE.height}
              src={thumbnail.url}
              width={THUMBNAIL_SIZE.width}
            />
          ) : null}

          {thumbnail?.status === "failed" ? (
            <span className="flex h-full w-full flex-col items-center justify-center gap-1.5 px-3 text-center text-caption text-ink-3 leading-snug">
              <ImageOff aria-hidden="true" size={16} strokeWidth={1.5} />
              <span className="line-clamp-3">
                {agentText(t, thumbnail.error).message}
              </span>
            </span>
          ) : null}

          {!thumbnail || thumbnail.status === "reading" ? (
            <Skeleton className="h-full w-full rounded-none" />
          ) : null}
        </button>
      </Tooltip>

      <figcaption className="flex items-center gap-2 px-3 py-2">
        <span className="min-w-0 flex-1">
          <span className="block truncate font-data text-ink text-small">
            {shot.name}
          </span>
          <span className="block truncate font-data text-caption text-ink-3 tabular-nums">
            {folder ? `${folder} · ` : ""}
            {weight(shot.size_bytes)} ·{" "}
            {Number.isNaN(taken) ? shot.created_at : since(taken)}
          </span>
        </span>

        <ConfirmButton
          confirmLabel={t("shots.remove")}
          disabled={removing}
          icon={Trash2}
          onConfirm={onRemove}
          question={t("shots.removeQuestion", { name: shot.name })}
          size="sm"
        >
          {t("shots.remove")}
        </ConfirmButton>
      </figcaption>
    </figure>
  );
}
