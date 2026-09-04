import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { humanBytes } from "../../lib/duration";
import { useOnboarding } from "../../stores/onboarding";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import { StatusDot } from "../ui/status-dot";
import { WaitingNotice } from "../ui/waiting-notice";

/**
 * The agent's binary, put on the machine before anything is asked of it.
 *
 * This screen comes before the catalogue and not with the install: the
 * catalogue is the agent's own answer, and a bare machine has none to give
 * until `pupitred` sits on it.
 */
export function OnboardingAgentScreen({
  serverName,
  onContinue,
}: {
  serverName?: string;
  onContinue?: () => void;
}) {
  const delivery = useOnboarding((state) => state.delivery);
  const sendAgent = useOnboarding((state) => state.sendAgent);

  useEffect(() => {
    if (useOnboarding.getState().delivery.status === "idle") {
      sendAgent();
    }
  }, [sendAgent]);

  return (
    <section className="flex flex-col gap-8">
      <PageHeader
        actions={
          delivery.status === "sent" ? (
            <Button icon={ArrowRight} onClick={onContinue} variant="inverse">
              Lire le catalogue
            </Button>
          ) : null
        }
        description="Le catalogue des services est celui de l'agent : il part sur le serveur avant qu'on lui demande quoi que ce soit."
        eyebrow="Agent"
        title={serverName ?? "Ce serveur"}
      />

      {delivery.status === "failed" ? (
        <Callout
          action={
            <Button icon={RefreshCw} onClick={sendAgent}>
              Réessayer
            </Button>
          }
          fix={delivery.error.fix}
          tone="danger"
        >
          {delivery.error.message}
        </Callout>
      ) : null}

      {delivery.status === "sent" ? (
        <div className="elevation-raised flex items-start gap-3 rounded-md border border-line bg-surface px-4 py-4">
          <span className="translate-y-1">
            <StatusDot shape="filled" size={12} tone="ok" />
          </span>
          <div className="min-w-0">
            <p className="font-medium text-ink">Agent en place</p>
            <p className="mt-1 text-ink-3 leading-relaxed">
              <code className="font-data">{delivery.delivery.path}</code> ·{" "}
              linux-{delivery.delivery.arch} ·{" "}
              {humanBytes(delivery.delivery.bytes)}
            </p>
            <p className="mt-2 break-all font-data text-[11px] text-ink-4">
              sha256 {delivery.delivery.sha256}
            </p>
          </div>
        </div>
      ) : null}

      {delivery.status === "sending" || delivery.status === "idle" ? (
        <WaitingNotice
          detail="Le binaire part sur le canal SSH déjà ouvert et s'installe dans /usr/local/bin."
          note="La somme de contrôle de ce que le serveur a reçu est comparée à celle de l'app avant la suite."
          title="Envoi de l'agent sur le serveur"
        />
      ) : null}
    </section>
  );
}
