import { Check } from "lucide-react";
import { Button } from "../ui/button";
import { PageHeader } from "../ui/page-header";
import { StatusDot } from "../ui/status-dot";

/**
 * The end of the onboarding: a machine that runs the agent, reached by the
 * account it opened. What comes next — the first project — is its own screen.
 */
export function OnboardingDoneScreen({
  serverName,
  user,
  rootClosed,
  onClose,
}: {
  serverName?: string;
  user: string;
  rootClosed: boolean;
  onClose?: () => void;
}) {
  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        actions={
          <Button icon={Check} onClick={onClose} variant="inverse">
            Terminer
          </Button>
        }
        description="Le serveur est installé, et l'app le pilote par son agent."
        eyebrow="Prêt"
        title={serverName ?? "Ce serveur"}
      />

      <div className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4">
        <span className="translate-y-1">
          <StatusDot
            shape={rootClosed ? "filled" : "ringed"}
            size={12}
            tone={rootClosed ? "ok" : "warn"}
          />
        </span>
        <div className="min-w-0">
          <p className="font-medium text-ink">
            Connecté en <code className="font-data">{user}</code>
          </p>
          <p className="mt-1 text-ink-3 leading-relaxed">
            {rootClosed
              ? "Root est fermé : plus personne n'entre sur cette machine avec ce compte."
              : "Root est resté ouvert : reprends le durcissement quand la raison donnée par l'agent aura disparu."}
          </p>
        </div>
      </div>
    </section>
  );
}
