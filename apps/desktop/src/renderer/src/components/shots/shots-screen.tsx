import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { Screen } from "@renderer/components/ui/screen";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { currentLocale } from "@renderer/i18n/translate";
import { useTranslations } from "@renderer/i18n/use-translations";
import { weight } from "@renderer/lib/format";
import { shotsByDay, useShots } from "@renderer/stores/shots";
import { ExternalLink, Image as ImageIcon, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { ShotTile } from "./shot-tile";
import { ShotViewer } from "./shot-viewer";

/** The day a group is filed under, said in the reader's language. */
function dayLabel(day: string): string {
  const parsed = Date.parse(`${day}T12:00:00Z`);

  return Number.isNaN(parsed)
    ? day
    : new Intl.DateTimeFormat(currentLocale(), {
        day: "numeric",
        month: "long",
        timeZone: "UTC",
        weekday: "long",
        year: "numeric",
      }).format(parsed);
}

/**
 * The gallery of a server, listed and read from here.
 *
 * The files stay where the agent put them: what the app brings over is the
 * bytes of the captures on screen, checked against the fingerprint that came
 * with them, grouped by the day folder the agent filed them under. The
 * server's own gallery address is still there for a browser, but the app no
 * longer needs it to show an image.
 */
export function ShotsScreen({ serverId }: { serverId: string }) {
  const t = useTranslations();

  const state = useShots((s) => s.state);
  const problem = useShots((s) => s.problem);
  const cleaning = useShots((s) => s.cleaning);
  const removing = useShots((s) => s.removing);
  const removed = useShots((s) => s.removed);
  const thumbnails = useShots((s) => s.thumbnails);
  const read = useShots((s) => s.read);
  const readThumbnail = useShots((s) => s.readThumbnail);
  const clean = useShots((s) => s.clean);
  const remove = useShots((s) => s.remove);
  const openGallery = useShots((s) => s.openGallery);
  const view = useShots((s) => s.view);
  const show = useShots((s) => s.show);
  const hide = useShots((s) => s.hide);

  useEffect(() => {
    read(serverId);

    return hide;
  }, [serverId, read, hide]);

  const shots = state.status === "read" ? state.shots : [];
  const total = shots.reduce((sum, shot) => sum + shot.size_bytes, 0);
  const days = shotsByDay(shots);

  return (
    <div className="relative h-full">
      <Screen
        actions={
          <>
            <Button icon={ExternalLink} onClick={() => openGallery(serverId)}>
              {t("shots.openGallery")}
            </Button>
            <ConfirmButton
              confirmLabel={t("shots.clearConfirm")}
              disabled={shots.length === 0}
              icon={Trash2}
              onConfirm={() => clean(serverId)}
              question={t("shots.clearQuestion")}
            >
              {t("shots.clear")}
            </ConfirmButton>
          </>
        }
        eyebrow={t("shots.eyebrow")}
        title={t("shots.title")}
      >
        {problem ? <ErrorNotice error={problem} /> : null}

        {state.status === "loading" ? (
          <section className="flex flex-col gap-3">
            <WaitingLine className="font-data text-[12px]">
              {t("shots.loadingDetail")}
            </WaitingLine>
            <SkeletonRows rows={3} />
          </section>
        ) : null}

        {state.status === "failed" ? (
          <ErrorNotice error={state.error} onRetry={() => read(serverId)} />
        ) : null}

        {state.status === "read" ? (
          <section className="flex flex-col gap-6">
            <p className="font-data text-[12px] text-ink-3">
              {shots.length === 0
                ? t("shots.none")
                : `${t.plural("shots.capture", shots.length)} · ${weight(total)}`}
              {removed === null
                ? ""
                : ` · ${t.plural("shots.removed", removed)}`}
            </p>

            {shots.length === 0 ? (
              <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
                <EmptyState icon={ImageIcon} title={t("shots.emptyTitle")} />
              </div>
            ) : null}

            {days.map((group) => (
              <section
                className="flex flex-col gap-3"
                data-shot-day={group.day}
                key={group.day}
              >
                <h2 className="flex items-baseline gap-2">
                  <Label>{dayLabel(group.day)}</Label>
                  <span className="font-data text-[11px] text-ink-3 tabular-nums">
                    {t.plural("shots.capture", group.shots.length)}
                  </span>
                </h2>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.shots.map((shot) => (
                    <ShotTile
                      key={shot.path}
                      onRemove={() => remove(serverId, shot.path)}
                      onShow={() => show(serverId, shot)}
                      onVisible={() => readThumbnail(serverId, shot)}
                      removing={removing === shot.path}
                      shot={shot}
                      shown={
                        view.status !== "idle" && view.shot.path === shot.path
                      }
                      thumbnail={thumbnails[shot.path]}
                    />
                  ))}
                </div>
              </section>
            ))}

            {cleaning ? (
              <WaitingNotice
                detail={t("shots.cleaningDetail")}
                title={t("shots.cleaningTitle")}
              />
            ) : null}
          </section>
        ) : null}
      </Screen>

      <ShotViewer serverId={serverId} />
    </div>
  );
}
