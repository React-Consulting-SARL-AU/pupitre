import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ServiceControl } from "@renderer/stores/services";
import type { ServiceDetail } from "@shared/services";
import { Play, RotateCw, Square } from "lucide-react";

/**
 * The three gestures a unit takes, and the one the state calls for first.
 *
 * A failed service is offered its start before anything else: that is its
 * remedy, without a reinstall. A restart is confirmed by name, because it
 * cuts whoever is connected to the service at that moment.
 */
export function ServiceControls({
  detail,
  busy,
  onControl,
}: {
  detail: ServiceDetail;
  /** The command in flight, as the protocol names it. */
  busy: string | null;
  onControl: (cmd: ServiceControl) => Promise<void>;
}) {
  const t = useTranslations();

  const working = busy?.startsWith("service.") ?? false;
  const stopped = detail.state === "stopped" || detail.state === "failed";

  return (
    <section className="flex flex-col gap-3" data-service-controls={detail.id}>
      <Label>{t("services.control.title")}</Label>

      <div className="flex flex-wrap items-center gap-2">
        {stopped ? (
          <Button
            disabled={working && busy !== "service.start"}
            icon={Play}
            loading={busy === "service.start"}
            onClick={() => onControl("service.start")}
            size="sm"
            variant="inverse"
          >
            {t("services.control.start")}
          </Button>
        ) : (
          <Button
            disabled={working && busy !== "service.stop"}
            icon={Square}
            loading={busy === "service.stop"}
            onClick={() => onControl("service.stop")}
            size="sm"
          >
            {t("services.control.stop")}
          </Button>
        )}

        <ConfirmButton
          confirmLabel={t("services.control.restartConfirm")}
          disabled={working}
          icon={RotateCw}
          onConfirm={() => onControl("service.restart")}
          question={t("services.control.restartQuestion", {
            name: detail.name,
          })}
          size="sm"
          variant="default"
        >
          {t("services.control.restart")}
        </ConfirmButton>
      </div>

      {detail.state === "failed" ? (
        <p className="text-[12px] text-ink-2 leading-relaxed">
          {t("services.control.failedHint", { name: detail.name })}
        </p>
      ) : null}
    </section>
  );
}
