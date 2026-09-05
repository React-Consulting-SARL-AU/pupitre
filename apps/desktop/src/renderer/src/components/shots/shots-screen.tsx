import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { PageHeader } from "@renderer/components/ui/page-header";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { weight } from "@renderer/lib/format";
import { useShots } from "@renderer/stores/shots";
import { ExternalLink, Image as ImageIcon, Trash2 } from "lucide-react";
import { useEffect } from "react";
import { ShotRow } from "./shot-row";
import { ShotViewer } from "./shot-viewer";

/**
 * The gallery of a server, listed and read from here.
 *
 * The files stay where the agent put them: what the app brings over is the
 * bytes of the one capture the reader asked to see, checked against the
 * fingerprint that came with them. The server's own gallery address is still
 * there for a browser, but the app no longer needs it to show an image.
 */
export function ShotsScreen({ serverId }: { serverId: string }) {
  const t = useTranslations();

  const state = useShots((s) => s.state);
  const problem = useShots((s) => s.problem);
  const cleaning = useShots((s) => s.cleaning);
  const removed = useShots((s) => s.removed);
  const read = useShots((s) => s.read);
  const clean = useShots((s) => s.clean);
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

  return (
    <div className="h-full overflow-y-auto px-8 py-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-8">
        <PageHeader
          actions={
            <>
              <Button
                icon={ExternalLink}
                onClick={() => openGallery(serverId)}
                size="sm"
              >
                {t("shots.openGallery")}
              </Button>
              <ConfirmButton
                confirmLabel={t("shots.clearConfirm")}
                disabled={shots.length === 0}
                icon={Trash2}
                onConfirm={() => clean(serverId)}
                question={t("shots.clearQuestion")}
                size="sm"
              >
                {t("shots.clear")}
              </ConfirmButton>
            </>
          }
          description={t("shots.description")}
          eyebrow={t("shots.eyebrow")}
          title={t("shots.title")}
        />

        {problem ? <ErrorNotice error={problem} /> : null}

        {state.status === "loading" ? (
          <WaitingNotice
            detail={t("shots.loadingDetail")}
            title={t("shots.title")}
          />
        ) : null}

        {state.status === "failed" ? (
          <ErrorNotice error={state.error} onRetry={() => read(serverId)} />
        ) : null}

        {state.status === "read" ? (
          <section className="flex flex-col gap-3">
            <p className="font-data text-[11px] text-ink-3">
              {shots.length === 0
                ? t("shots.none")
                : `${t.plural("shots.capture", shots.length)} · ${weight(total)}`}
              {removed === null
                ? ""
                : ` · ${t.plural("shots.removed", removed)}`}
            </p>

            <ShotViewer serverId={serverId} />

            <div className="elevation-raised overflow-hidden rounded-md border border-line bg-surface">
              {shots.length === 0 ? (
                <EmptyState
                  detail={t("shots.emptyDetail")}
                  icon={ImageIcon}
                  title={t("shots.emptyTitle")}
                />
              ) : (
                <div className="divide-y divide-line">
                  {shots.map((shot) => (
                    <ShotRow
                      key={shot.path}
                      onShow={() => show(serverId, shot)}
                      shot={shot}
                      shown={
                        view.status !== "idle" && view.shot.path === shot.path
                      }
                    />
                  ))}
                </div>
              )}
            </div>

            {cleaning ? (
              <WaitingNotice
                detail={t("shots.cleaningDetail")}
                title={t("shots.cleaningTitle")}
              />
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
