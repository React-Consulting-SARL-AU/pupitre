import type { Shot } from "@pupitre/shared/agent-protocol/processes";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ThumbnailState } from "@renderer/stores/shots";
import { ShotStripItem } from "./shot-strip-item";

export function ShotStrip({
  shots,
  current,
  thumbnails,
  onVisible,
  onShow,
}: {
  shots: readonly Shot[];
  current: string;
  thumbnails: Record<string, ThumbnailState>;
  onVisible: (shot: Shot) => void;
  onShow: (shot: Shot) => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <nav
      aria-label={t("shots.stripLabel")}
      className="flex shrink-0 gap-2 overflow-x-auto pb-1"
    >
      {shots.map((shot) => (
        <ShotStripItem
          active={shot.path === current}
          key={shot.path}
          onShow={() => onShow(shot)}
          onVisible={() => onVisible(shot)}
          shot={shot}
          thumbnail={thumbnails[shot.path]}
        />
      ))}
    </nav>
  );
}
