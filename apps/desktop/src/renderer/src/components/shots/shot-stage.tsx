import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { IconButton } from "@renderer/components/ui/icon-button";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { weight } from "@renderer/lib/format";
import type { ShotView } from "@renderer/stores/shots";
import { ChevronLeft, ChevronRight, Maximize2, Minimize2 } from "lucide-react";
import { useState } from "react";

// Mounted per capture, so a new capture opens fitted again.
export function ShotStage({
  view,
  hasPrevious,
  hasNext,
  onStep,
  onRetry,
}: {
  view: Exclude<ShotView, { status: "idle" }>;
  hasPrevious: boolean;
  hasNext: boolean;
  onStep: (direction: -1 | 1) => Promise<void>;
  onRetry: () => Promise<void>;
}) {
  const t = useTranslations();

  const [actual, setActual] = useState(false);
  const zoom = actual ? t("shots.zoomFit") : t("shots.zoomActual");

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden rounded-md border border-line bg-sunken">
      <IconButton
        className="absolute top-1/2 left-3 z-10 -translate-y-1/2 bg-surface"
        disabled={!hasPrevious}
        icon={ChevronLeft}
        label={t("shots.previous")}
        onClick={() => onStep(-1)}
        size={16}
      />

      {view.status === "reading" ? (
        <div className="w-full max-w-md px-6">
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
        <div className="w-full max-w-md px-6">
          <ErrorNotice error={view.error} onRetry={onRetry} />
        </div>
      ) : null}

      {view.status === "shown" ? (
        <div
          className={`h-full w-full ${actual ? "overflow-auto" : "flex items-center justify-center p-4"}`}
          data-shot-zoom={actual ? "actual" : "fit"}
        >
          <button
            aria-label={zoom}
            className={`block ${actual ? "cursor-zoom-out" : "h-full w-full cursor-zoom-in"}`}
            onClick={() => setActual(!actual)}
            type="button"
          >
            <img
              alt={t("shots.alt", { name: view.shot.name })}
              className={
                actual
                  ? "max-w-none"
                  : "mx-auto h-full w-full max-w-full object-contain"
              }
              height={view.size?.height}
              src={view.url}
              width={view.size?.width}
            />
          </button>
        </div>
      ) : null}

      {view.status === "shown" ? (
        <IconButton
          className="absolute top-3 right-3 z-10 bg-surface"
          icon={actual ? Minimize2 : Maximize2}
          label={zoom}
          onClick={() => setActual(!actual)}
          pressed={actual}
        />
      ) : null}

      <IconButton
        className="absolute top-1/2 right-3 z-10 -translate-y-1/2 bg-surface"
        disabled={!hasNext}
        icon={ChevronRight}
        label={t("shots.next")}
        onClick={() => onStep(1)}
        size={16}
      />
    </div>
  );
}
