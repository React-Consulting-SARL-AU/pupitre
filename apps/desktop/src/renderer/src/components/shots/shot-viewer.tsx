import { Dialog } from "@base-ui-components/react/dialog";
import { Button } from "@renderer/components/ui/button";
import { CopyButton } from "@renderer/components/ui/copy-button";
import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { IconButton } from "@renderer/components/ui/icon-button";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { weight } from "@renderer/lib/format";
import { useShots } from "@renderer/stores/shots";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";
import { type KeyboardEvent, useRef } from "react";

/**
 * The capture itself, laid over the gallery rather than pushed into it.
 *
 * The image comes from the app's own memory, checked against the fingerprint
 * the agent gave: nothing is downloaded, no browser is opened, and no port of
 * the server is brought over to show it. The arrows walk the list, Escape puts
 * the overlay away, and the bytes already here are what the clipboard gets.
 */
export function ShotViewer({ serverId }: { serverId: string }) {
  const t = useTranslations();

  const view = useShots((s) => s.view);
  const state = useShots((s) => s.state);
  const show = useShots((s) => s.show);
  const step = useShots((s) => s.step);
  const hide = useShots((s) => s.hide);
  const save = useShots((s) => s.save);
  const saved = useShots((s) => s.saved);
  const saveProblem = useShots((s) => s.saveProblem);

  // The frame itself takes the focus: a button that goes away with the next
  // capture — save, copy — would take the focus out with it, and a dialog
  // whose focus leaves is a dialog that closes. The arrows are read on the
  // frame too, where the focus is: the dialog keeps a key from reaching the
  // window.
  const popup = useRef<HTMLDivElement | null>(null);

  function onKey(event: KeyboardEvent<HTMLDivElement>): void {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      step(serverId, -1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      step(serverId, 1);
    }
  }

  if (view.status === "idle") {
    return null;
  }

  const shots = state.status === "read" ? state.shots : [];
  const at = shots.findIndex((shot) => shot.path === view.shot.path);
  const hasPrevious = at > 0;
  const hasNext = at !== -1 && at < shots.length - 1;

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
          className="fixed inset-0 z-20 flex flex-col bg-base/95 p-6 outline-none transition-pop data-[ending-style]:opacity-0 data-[starting-style]:opacity-0"
          data-shot-viewer={view.shot.path}
          initialFocus={popup}
          onKeyDown={onKey}
          ref={popup}
        >
          <header className="flex shrink-0 items-center gap-3">
            <span className="min-w-0 flex-1 truncate font-data text-[13px] text-ink">
              {view.shot.name}
            </span>

            {view.status === "shown" ? (
              <span className="shrink-0 font-data text-[12px] text-ink-3 tabular-nums">
                {view.size
                  ? `${view.mediaType} · ${view.size.width} × ${view.size.height}`
                  : view.mediaType}
              </span>
            ) : null}

            {at === -1 ? null : (
              <span className="shrink-0 font-data text-[12px] text-ink-3 tabular-nums">
                {t("shots.position", { index: at + 1, total: shots.length })}
              </span>
            )}

            {view.status === "shown" ? (
              <Button icon={Download} onClick={save} size="sm">
                {t("shots.save")}
              </Button>
            ) : null}

            {view.status === "shown" ? (
              <CopyButton
                onCopy={() =>
                  navigator.clipboard.write([
                    new ClipboardItem({ [view.blob.type]: view.blob }),
                  ])
                }
              >
                {t("shots.copyImage")}
              </CopyButton>
            ) : null}

            <Button icon={X} onClick={hide} size="sm" variant="discreet">
              {t("shots.close")}
            </Button>
          </header>

          {saved ? (
            <p
              className="mt-2 truncate font-data text-[12px] text-ink-3"
              data-shot-saved={saved}
              role="status"
            >
              {t("shots.saved", { path: saved })}
            </p>
          ) : null}

          {saveProblem ? (
            <div className="mt-2">
              <ErrorNotice error={saveProblem} name="shot-save" />
            </div>
          ) : null}

          <div className="relative mt-4 flex min-h-0 flex-1 items-center justify-center">
            <IconButton
              className="absolute left-0 z-10 bg-surface"
              disabled={!hasPrevious}
              icon={ChevronLeft}
              label={t("shots.previous")}
              onClick={() => step(serverId, -1)}
              size={16}
            />

            {view.status === "reading" ? (
              <div className="w-full max-w-md">
                <WaitingNotice
                  detail={t("shots.readingDetail", {
                    name: view.shot.name,
                    weight: weight(view.shot.size_bytes),
                  })}
                  title={t("shots.readingTitle")}
                />
              </div>
            ) : null}

            {view.status === "failed" ? (
              <div className="w-full max-w-md">
                <ErrorNotice
                  error={view.error}
                  onRetry={() => show(serverId, view.shot)}
                />
              </div>
            ) : null}

            {view.status === "shown" ? (
              <img
                alt={t("shots.alt", { name: view.shot.name })}
                className="elevation-overlay max-h-full max-w-full rounded-sm bg-sunken object-contain"
                height={view.size?.height}
                src={view.url}
                width={view.size?.width}
              />
            ) : null}

            <IconButton
              className="absolute right-0 z-10 bg-surface"
              disabled={!hasNext}
              icon={ChevronRight}
              label={t("shots.next")}
              onClick={() => step(serverId, 1)}
              size={16}
            />
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
