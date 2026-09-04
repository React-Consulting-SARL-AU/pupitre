import { ArrowRight, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { humanBytes } from "../../lib/duration";
import { accountOf, useAccount } from "../../stores/account";
import { useOnboarding } from "../../stores/onboarding";
import { Button } from "../ui/button";
import { Callout } from "../ui/callout";
import { PageHeader } from "../ui/page-header";
import { StatusDot } from "../ui/status-dot";
import { WaitingNotice } from "../ui/waiting-notice";
import { OnboardingAccountGate } from "./onboarding-account-gate";
import { OnboardingEnrollmentNote } from "./onboarding-enrollment-note";

/**
 * The agent's binary, put on the machine before anything is asked of it.
 *
 * The server is enrolled first: the platform gives it a seat, names the release
 * to push, and hands the binary over. Only a development build without an
 * account still pushes the one the app built locally.
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
  const view = useAccount((state) => state.view);
  const readAccount = useAccount((state) => state.read);

  const account = accountOf(view);
  const granted = account?.usage.status === "granted";

  useEffect(() => {
    readAccount();
  }, [readAccount]);

  useEffect(() => {
    if (granted && useOnboarding.getState().delivery.status === "idle") {
      sendAgent();
    }
  }, [granted, sendAgent]);

  if (!account) {
    return (
      <WaitingNotice
        detail="Le droit d'usage de cet appareil est vérifié avant tout envoi."
        title="Lecture du compte"
      />
    );
  }

  if (!granted) {
    return <OnboardingAccountGate account={account} serverName={serverName} />;
  }

  return (
    <section className="flex flex-col gap-section">
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
        <>
          <OnboardingEnrollmentNote
            enrollment={delivery.delivery.enrollment ?? null}
          />

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
        </>
      ) : null}

      {delivery.status === "sending" || delivery.status === "idle" ? (
        <WaitingNotice
          detail="Le serveur est enrôlé, puis le binaire signé part sur le canal SSH déjà ouvert et s'installe dans /usr/local/bin."
          note="La somme de contrôle de ce que le serveur a reçu est comparée à celle de l'app avant la suite."
          title="Enrôlement et envoi de l'agent"
        />
      ) : null}
    </section>
  );
}
