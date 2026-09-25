import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { useTranslations } from "@renderer/i18n/use-translations";
import { ArrowRight, Download, RefreshCw, Server } from "lucide-react";
import { Button } from "../ui/button";

export interface InspectionActions {
  onInstall?: () => void;
  onUpgrade?: () => void;
  onContinue?: () => void;
  onPickAnother?: () => void;
}

export function OnboardingInspectionActions({
  probe,
  onInstall,
  onUpgrade,
  onContinue,
  onPickAnother,
}: { probe: ProbeResult } & InspectionActions) {
  const t = useTranslations();

  const { kind, up_to_date } = probe.verdict;

  const another = (
    <Button icon={Server} onClick={onPickAnother} variant="discreet">
      {t("onboarding.inspection.pickAnother")}
    </Button>
  );

  // Any other button would promise an install an incompatible machine cannot take.
  if (kind === "incompatible") {
    return <div className="flex flex-wrap items-center gap-2">{another}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {kind === "bare" ? (
        <Button icon={Download} onClick={onInstall} variant="inverse">
          {t("onboarding.inspection.install")}
        </Button>
      ) : null}

      {kind === "managed" && up_to_date === false ? (
        <Button icon={RefreshCw} onClick={onUpgrade} variant="inverse">
          {t("onboarding.inspection.update")}
        </Button>
      ) : null}

      {kind === "managed" ? (
        <Button
          icon={ArrowRight}
          onClick={onContinue}
          variant={up_to_date === false ? "default" : "inverse"}
        >
          {t("onboarding.inspection.continue")}
        </Button>
      ) : null}

      {kind === "occupied" ? (
        <Button icon={Download} onClick={onInstall}>
          {t("onboarding.inspection.installAnyway")}
        </Button>
      ) : null}

      {another}
    </div>
  );
}
