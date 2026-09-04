import { RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { useHarden } from "../../stores/harden";
import { InstallStepRow } from "../install/install-step-row";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import { WaitingNotice } from "../ui/waiting-notice";
import { OnboardingHardenOutcome } from "./onboarding-harden-outcome";

/**
 * The last step of the onboarding: root closed, and the app moved to `dev`.
 *
 * The app asks for the hardening and watches the agent do it; it only rewrites
 * its own SSH configuration once the agent says root is closed — which the
 * agent only says once a key has opened `dev` in front of it.
 */
export function OnboardingHardenScreen({
  serverId,
  serverName,
  onContinue,
}: {
  serverId: string;
  serverName?: string;
  onContinue?: () => void;
}) {
  const harden = useHarden((state) => state.harden);
  const steps = useHarden((state) => state.steps);
  const start = useHarden((state) => state.start);

  useEffect(() => {
    if (useHarden.getState().harden.status === "idle") {
      start(serverId);
    }
  }, [serverId, start]);

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        description="L'agent ouvre le compte dev, vérifie qu'une clé y entre, puis ferme root. L'app suit avec sa propre configuration SSH."
        eyebrow="Durcissement"
        title={serverName ?? "Ce serveur"}
      />

      {harden.status === "running" ? (
        <WaitingNotice
          detail="Compte dev, clés recopiées, connexion vérifiée, mots de passe et root fermés."
          note="Root ne sera fermé que si une clé ouvre dev : sinon l'agent s'arrête et le dit."
          title="Durcissement en cours"
        />
      ) : null}

      {harden.status === "switching" ? (
        <WaitingNotice
          detail={`L'app réécrit sa configuration SSH en User ${harden.user} et rouvre le canal.`}
          title="Bascule de la connexion"
        />
      ) : null}

      {steps.length > 0 ? (
        <ul className="elevation-raised divide-y divide-line overflow-hidden rounded-md border border-line bg-surface px-4 py-1">
          {steps.map((step) => (
            <InstallStepRow key={step.step} step={step} />
          ))}
        </ul>
      ) : null}

      {harden.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={() => start(serverId)}>
              Réessayer
            </Button>
          }
          fix={harden.error.fix}
          tone="danger"
        >
          {harden.error.message}
        </Callout>
      ) : null}

      {harden.status === "done" ? (
        <OnboardingHardenOutcome
          onContinue={onContinue}
          onRetry={() => start(serverId)}
          outcome={harden.outcome}
        />
      ) : null}
    </section>
  );
}
