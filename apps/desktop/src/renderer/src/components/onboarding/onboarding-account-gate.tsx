import { AccountSignInCard } from "@renderer/components/account/account-sign-in-card";
import { AccountUsageNotice } from "@renderer/components/account/account-usage-notice";
import { PageHeader } from "@renderer/components/ui/page-header";
import { useAccount } from "@renderer/stores/account";
import type { AccountState } from "@shared/account";

/**
 * The wall a packaged build puts before the first install.
 *
 * The agent's binary comes from the platform, so a machine cannot be set up
 * without an account: the screen says it plainly, gives the way in, and gives the
 * console's address for whoever would rather start there.
 */
export function OnboardingAccountGate({
  account,
  serverName,
}: {
  account: AccountState;
  serverName?: string;
}) {
  const signIn = useAccount((state) => state.signIn);
  const connect = useAccount((state) => state.connect);

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        description="L'agent est téléchargé depuis la plateforme, signé, puis poussé sur le serveur. Cette app ne l'embarque plus."
        eyebrow="Compte"
        title={serverName ?? "Installer un serveur"}
      />

      <AccountUsageNotice checkedAt={account.checkedAt} usage={account.usage} />

      <AccountSignInCard
        consoleUrl={account.consoleUrl}
        onConnect={connect}
        onOpenConsole={() => window.pupitre.openUrl(account.consoleUrl)}
        signIn={signIn}
      />
    </section>
  );
}
