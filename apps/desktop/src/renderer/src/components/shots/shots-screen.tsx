import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Screen } from "@renderer/components/ui/screen";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { currentLocale } from "@renderer/i18n/translate";
import { useTranslations } from "@renderer/i18n/use-translations";
import { weight } from "@renderer/lib/format";
import { folderLabel } from "@renderer/lib/shot-folder";
import { useNavigation } from "@renderer/stores/navigation";
import {
  ALL_SHOTS,
  folderOf,
  shotsByDay,
  shotsIn,
  useShots,
} from "@renderer/stores/shots";
import { ExternalLink, Globe, Image as ImageIcon, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { ShotFolders } from "./shot-folders";
import { ShotTile } from "./shot-tile";
import { ShotViewer } from "./shot-viewer";

const GALLERY_SERVICE = "ai.browser";

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

export function ShotsScreen({
  serverId,
  serverName,
}: {
  serverId: string;
  serverName: string;
}) {
  const t = useTranslations();

  const state = useShots((s) => s.state);
  const address = useShots((s) => s.address);
  const folder = useShots((s) => s.folder);
  const problem = useShots((s) => s.problem);
  const cleaning = useShots((s) => s.cleaning);
  const removing = useShots((s) => s.removing);
  const removed = useShots((s) => s.removed);
  const thumbnails = useShots((s) => s.thumbnails);
  const read = useShots((s) => s.read);
  const choose = useShots((s) => s.choose);
  const readThumbnail = useShots((s) => s.readThumbnail);
  const clean = useShots((s) => s.clean);
  const remove = useShots((s) => s.remove);
  const openGallery = useShots((s) => s.openGallery);
  const view = useShots((s) => s.view);
  const show = useShots((s) => s.show);
  const hide = useShots((s) => s.hide);
  const openService = useNavigation((s) => s.openService);

  useEffect(() => {
    read(serverId);

    return hide;
  }, [serverId, read, hide]);

  const shots = state.status === "read" ? state.shots : [];
  const visible = shotsIn(shots, folder);
  const total = visible.reduce((sum, shot) => sum + shot.size_bytes, 0);
  const days = shotsByDay(visible);

  return (
    <div className="relative h-full">
      <Screen
        actions={
          <>
            {address?.exposed ? (
              <Button icon={ExternalLink} onClick={openGallery}>
                {t("shots.openGallery")}
              </Button>
            ) : (
              <Button icon={Globe} onClick={() => openService(GALLERY_SERVICE)}>
                {t("shots.publish")}
              </Button>
            )}
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
        eyebrow={serverName}
        tabs={
          shots.length > 0 ? (
            <ShotFolders folder={folder} onChoose={choose} shots={shots} />
          ) : undefined
        }
        title={t("shots.title")}
      >
        {problem ? <ErrorNotice error={problem} /> : null}

        {state.status === "loading" ? <SkeletonRows rows={3} /> : null}

        {state.status === "failed" ? (
          <ErrorNotice error={state.error} onRetry={() => read(serverId)} />
        ) : null}

        {state.status === "read" ? (
          <section className="flex flex-col gap-6">
            <p className="font-data text-ink-3 text-small">
              {visible.length === 0
                ? t("shots.none")
                : `${t.plural("shots.capture", visible.length)} · ${weight(total)}`}
              {removed === null
                ? ""
                : ` · ${t.plural("shots.removed", removed)}`}
            </p>

            {shots.length === 0 ? (
              <Panel className="overflow-hidden" inset="none">
                <EmptyState icon={ImageIcon} title={t("shots.emptyTitle")} />
              </Panel>
            ) : null}

            {days.map((group) => (
              <Section
                aside={
                  <span className="font-data text-ink-3 text-small tabular-nums">
                    {t.plural("shots.capture", group.shots.length)}
                  </span>
                }
                data-shot-day={group.day}
                key={group.day}
                name={group.day}
                title={dayLabel(group.day)}
              >
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {group.shots.map((shot) => (
                    <ShotTile
                      folder={
                        folder === ALL_SHOTS
                          ? folderLabel(t, folderOf(shot))
                          : null
                      }
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
              </Section>
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
