import { Button } from "@renderer/components/ui/button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { weight } from "@renderer/lib/format";
import { useShots } from "@renderer/stores/shots";
import { X } from "lucide-react";

/**
 * The capture itself, read over the channel the app already holds.
 *
 * The image comes from the app's own memory, checked against the fingerprint
 * the agent gave: nothing is downloaded, no browser is opened, and no port of
 * the server is brought over to show it.
 */
export function ShotViewer({ serverId }: { serverId: string }) {
  const t = useTranslations();

  const view = useShots((s) => s.view);
  const show = useShots((s) => s.show);
  const hide = useShots((s) => s.hide);

  if (view.status === "idle") {
    return null;
  }

  if (view.status === "reading") {
    return (
      <WaitingNotice
        detail={t("shots.readingDetail", {
          name: view.shot.name,
          weight: weight(view.shot.size_bytes),
        })}
        title={t("shots.readingTitle")}
      />
    );
  }

  if (view.status === "failed") {
    return (
      <ErrorNotice
        error={view.error}
        onRetry={() => show(serverId, view.shot)}
      />
    );
  }

  return (
    <section className="elevation-raised flex flex-col gap-3 rounded-md border border-line bg-surface p-4">
      <header className="flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate font-data text-[13px] text-ink">
          {view.shot.name}
        </span>
        <span className="shrink-0 font-data text-[12px] text-ink-3 tabular-nums">
          {view.size
            ? `${view.mediaType} · ${view.size.width} × ${view.size.height}`
            : view.mediaType}
        </span>
        <Button icon={X} onClick={hide} size="sm" variant="discreet">
          {t("shots.close")}
        </Button>
      </header>

      <img
        alt={t("shots.alt", { name: view.shot.name })}
        className="max-h-[60vh] w-full rounded-sm bg-sunken object-contain"
        height={view.size?.height}
        src={view.url}
        width={view.size?.width}
      />
    </section>
  );
}
