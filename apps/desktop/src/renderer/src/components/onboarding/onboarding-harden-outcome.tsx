import type { HardenOutcome } from "@shared/harden";
import { ArrowRight, RefreshCw } from "lucide-react";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { StatusDot } from "../ui/status-dot";

/**
 * What the hardening concluded, in the agent's own words.
 *
 * Root closed, and the app already speaks to the machine as `dev`: there is
 * nothing left to do. Root kept, and the reason is printed exactly as it came —
 * the agent is the one that looked at `authorized_keys`, not us — with the
 * button that tries again once the reason is gone.
 */
export function OnboardingHardenOutcome({
  outcome,
  onRetry,
  onContinue,
}: {
  outcome: HardenOutcome;
  onRetry?: () => void;
  onContinue?: () => void;
}) {
  const closed = outcome.harden.root_closed;

  return (
    <section className="flex flex-col gap-5">
      {closed ? (
        <div className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4">
          <span className="translate-y-1">
            <StatusDot
              shape={outcome.reconnected ? "filled" : "ringed"}
              size={12}
              tone={outcome.reconnected ? "ok" : "warn"}
            />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">
              Root est fermé sur ce serveur.
            </p>
            <p className="mt-1 text-ink-3 leading-relaxed">
              L'app s'y connecte maintenant avec le compte{" "}
              <code className="font-data text-ink-2">
                {outcome.user ?? outcome.harden.next_user}
              </code>
              , par sa propre configuration SSH.
            </p>
          </div>
        </div>
      ) : (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onRetry}>
              Réessayer
            </Button>
          }
          tone="warn"
        >
          {outcome.harden.reason ??
            "L'agent n'a pas fermé root, sans en donner la raison."}
        </Callout>
      )}

      {closed ? null : (
        <p className="text-ink-3 leading-relaxed">
          Root reste ouvert et rien n'a été changé sur la machine : le compte{" "}
          <code className="font-data text-ink-2">
            {outcome.harden.next_user}
          </code>{" "}
          est celui que l'app continue d'utiliser.
        </p>
      )}

      {outcome.error ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={onRetry}>
              Réessayer
            </Button>
          }
          fix={outcome.error.fix}
          tone="danger"
        >
          {outcome.error.message}
        </Callout>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button icon={ArrowRight} onClick={onContinue} variant="inverse">
          {closed ? "Terminer" : "Continuer sans fermer root"}
        </Button>
      </div>
    </section>
  );
}
