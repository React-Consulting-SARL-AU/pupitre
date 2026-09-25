import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { ServiceControl } from "@renderer/stores/services";
import type { ServiceDetail } from "@shared/services";
import { Play, RotateCw, Square } from "lucide-react";

/** A restart is confirmed: it cuts whoever is connected to the service. */
export function ServiceControls({
  detail,
  busy,
  onControl,
}: {
  detail: ServiceDetail;
  busy: string | null;
  onControl: (cmd: ServiceControl) => Promise<void>;
}) {
  const t = useTranslations();

  const working = busy?.startsWith("service.") ?? false;
  const stopped = detail.state === "stopped" || detail.state === "failed";

  return (
    <span className="contents" data-service-controls={detail.id}>
      {stopped ? (
        <Button
          disabled={working && busy !== "service.start"}
          icon={Play}
          loading={busy === "service.start"}
          onClick={() => onControl("service.start")}
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
        variant="default"
      >
        {t("services.control.restart")}
      </ConfirmButton>
    </span>
  );
}
