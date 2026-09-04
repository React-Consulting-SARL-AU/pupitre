import type { ProbeResult } from "@pupitre/shared/agent-protocol/install";
import { ArrowRight, Download, RefreshCw, Server } from "lucide-react";
import { Button } from "../ui/button";

export interface InspectionActions {
  onInstall?: () => void;
  onUpgrade?: () => void;
  onContinue?: () => void;
  onPickAnother?: () => void;
}

/**
 * What the verdict allows, and nothing else.
 *
 * A blocked machine gets one way out — another server — because every other
 * button would promise an installation that cannot happen.
 */
export function OnboardingInspectionActions({
  probe,
  onInstall,
  onUpgrade,
  onContinue,
  onPickAnother,
}: { probe: ProbeResult } & InspectionActions) {
  const { kind, up_to_date } = probe.verdict;

  const another = (
    <Button icon={Server} onClick={onPickAnother} variant="discreet">
      Choisir un autre serveur
    </Button>
  );

  if (kind === "incompatible") {
    return <div className="flex flex-wrap items-center gap-2">{another}</div>;
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {kind === "bare" ? (
        <Button icon={Download} onClick={onInstall} variant="inverse">
          Installer
        </Button>
      ) : null}

      {kind === "managed" && up_to_date === false ? (
        <Button icon={RefreshCw} onClick={onUpgrade} variant="inverse">
          Mettre à jour
        </Button>
      ) : null}

      {kind === "managed" ? (
        <Button
          icon={ArrowRight}
          onClick={onContinue}
          variant={up_to_date === false ? "default" : "inverse"}
        >
          Continuer
        </Button>
      ) : null}

      {kind === "occupied" ? (
        <Button icon={Download} onClick={onInstall}>
          Installer quand même
        </Button>
      ) : null}

      {another}
    </div>
  );
}
