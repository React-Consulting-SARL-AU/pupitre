import { Dialog } from "@base-ui-components/react/dialog";
import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { CopyButton } from "@renderer/components/ui/copy-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { folderLabel } from "@renderer/lib/shot-folder";
import { folderOf, shotsIn, useShots } from "@renderer/stores/shots";
import { Download, Trash2, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { ShotDetails } from "./shot-details";
import { ShotStage } from "./shot-stage";
import { ShotStrip } from "./shot-strip";

export function ShotViewer({ serverId }: { serverId: string }) {
  const t = useTranslations();

  const view = useShots((s) => s.view);
  const state = useShots((s) => s.state);
  const folder = useShots((s) => s.folder);
  const address = useShots((s) => s.address);
  const thumbnails = useShots((s) => s.thumbnails);
  const removing = useShots((s) => s.removing);
  const show = useShots((s) => s.show);
  const step = useShots((s) => s.step);
  const hide = useShots((s) => s.hide);
  const save = useShots((s) => s.save);
  const remove = useShots((s) => s.remove);
  const readThumbnail = useShots((s) => s.readThumbnail);
  const saved = useShots((s) => s.saved);
  const saveProblem = useShots((s) => s.saveProblem);

  // Focus sits on the frame: a button that unmounts with the next capture would drop focus and close the dialog.
  const popup = useRef<HTMLDivElement | null>(null);
  const open = view.status !== "idle";

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKey(event: globalThis.KeyboardEvent): void {
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        step(serverId, -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        step(serverId, 1);
      }
    }

    // Capture phase, so a key stopped inside the dialog still walks the list.
    window.addEventListener("keydown", onKey, true);

    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open, serverId, step]);

  if (view.status === "idle") {
    return null;
  }

  const shots = shotsIn(state.status === "read" ? state.shots : [], folder);
  const at = shots.findIndex((shot) => shot.path === view.shot.path);

  return (
    <Dialog.Root
      onOpenChange={(next) => {
        if (!next) {
          hide();
        }
      }}
      open
    >
      <Dialog.Portal>
        <Dialog.Popup
          aria-label={t("shots.viewerLabel", { name: view.shot.name })}
          className="fixed inset-0 z-20 flex flex-col gap-4 bg-base p-6 outline-none transition-pop data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          data-shot-viewer={view.shot.path}
          initialFocus={popup}
          ref={popup}
        >
          <header className="flex shrink-0 items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="truncate text-caption text-ink-3">
                {folderLabel(t, folderOf(view.shot))}
                {at === -1
                  ? ""
                  : ` · ${t("shots.position", { index: at + 1, total: shots.length })}`}
              </p>
              <h2 className="truncate font-data text-control text-ink">
                {view.shot.name}
              </h2>
            </div>

            {view.status === "shown" ? (
              <>
                <CopyButton
                  onCopy={() =>
                    navigator.clipboard.write([
                      new ClipboardItem({ [view.blob.type]: view.blob }),
                    ])
                  }
                >
                  {t("shots.copyImage")}
                </CopyButton>
                <Button icon={Download} onClick={save} size="sm">
                  {t("shots.save")}
                </Button>
              </>
            ) : null}

            <ConfirmButton
              confirmLabel={t("shots.remove")}
              disabled={removing === view.shot.path}
              icon={Trash2}
              onConfirm={() => remove(serverId, view.shot.path)}
              question={t("shots.removeQuestion", { name: view.shot.name })}
              size="sm"
            >
              {t("shots.remove")}
            </ConfirmButton>

            <Button icon={X} onClick={hide} size="sm" variant="discreet">
              {t("shots.close")}
            </Button>
          </header>

          {saved ? (
            <p
              className="truncate font-data text-ink-3 text-small"
              data-shot-saved={saved}
              role="status"
            >
              {t("shots.saved", { path: saved })}
            </p>
          ) : null}

          {saveProblem ? (
            <ErrorNotice error={saveProblem} name="shot-save" />
          ) : null}

          <div className="flex min-h-0 flex-1 gap-6">
            <ShotStage
              hasNext={at !== -1 && at < shots.length - 1}
              hasPrevious={at > 0}
              key={view.shot.path}
              onRetry={() => show(serverId, view.shot)}
              onStep={(direction) => step(serverId, direction)}
              view={view}
            />

            <ShotDetails
              address={address}
              mediaType={view.status === "shown" ? view.mediaType : null}
              shot={view.shot}
              size={view.status === "shown" ? view.size : null}
            />
          </div>

          {shots.length > 1 ? (
            <ShotStrip
              current={view.shot.path}
              onShow={(shot) => show(serverId, shot)}
              onVisible={(shot) => readThumbnail(serverId, shot)}
              shots={shots}
              thumbnails={thumbnails}
            />
          ) : null}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
