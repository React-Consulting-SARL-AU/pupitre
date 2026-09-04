import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useInspection } from "../../stores/inspection";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import { WaitingNotice } from "../ui/waiting-notice";
import type { InspectionActions } from "./onboarding-inspection-actions";
import { OnboardingInspectionResult } from "./onboarding-inspection-result";

/**
 * The inspection of one server, from the wait to the verdict.
 *
 * The probe only reads: it is sent on standard input and runs from memory, so a
 * server we decide against is left exactly as it was found. The screen says so,
 * because that is the promise being made while the reader waits.
 */
export function OnboardingInspectionScreen({
  serverId,
  serverName,
  ...actions
}: { serverId: string; serverName?: string } & InspectionActions) {
  const inspection = useInspection((state) => state.inspection);
  const inspect = useInspection((state) => state.inspect);

  useEffect(() => {
    inspect(serverId);
  }, [serverId, inspect]);

  if (inspection.status === "done" && inspection.serverId === serverId) {
    return (
      <OnboardingInspectionResult
        probe={inspection.probe}
        serverName={serverName}
        {...actions}
      />
    );
  }

  const failed =
    inspection.status === "failed" && inspection.serverId === serverId
      ? inspection.error
      : null;

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        description="Ce que la machine est, avant d'y toucher."
        eyebrow="Inspection"
        title={serverName ?? "Ce serveur"}
      />

      {failed ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={() => inspect(serverId)}>
              Relancer
            </Button>
          }
          fix={failed.fix}
          tone="danger"
        >
          {failed.message}
        </Callout>
      ) : (
        <WaitingNotice
          detail="Distribution, architecture, mémoire, disque, ports écoutés, comptes existants, agent déjà installé."
          note="La sonde est lue depuis l'entrée standard : rien n'est écrit sur le serveur."
          title="Inspection en cours"
        />
      )}
    </section>
  );
}
