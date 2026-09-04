import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { accountOf, useAccount } from "@renderer/stores/account";
import { useEffect } from "react";
import { AccountIdentityCard } from "./account-identity-card";
import { AccountSignInCard } from "./account-sign-in-card";
import { AccountUsageNotice } from "./account-usage-notice";

/**
 * The account section of the settings.
 *
 * It shows the right to work first, because that is what decides whether the
 * app can install anything, and the identity second. Nothing here holds a
 * token: the main process answers with a state, and the state is what is drawn.
 */
export function AccountPanel() {
  const view = useAccount((state) => state.view);
  const signIn = useAccount((state) => state.signIn);
  const read = useAccount((state) => state.read);
  const connect = useAccount((state) => state.connect);
  const refresh = useAccount((state) => state.refresh);
  const disconnect = useAccount((state) => state.disconnect);

  useEffect(() => {
    read();
  }, [read]);

  const account = accountOf(view);

  if (!account) {
    return (
      <WaitingNotice
        detail="Le trousseau de cet ordinateur est interrogé."
        title="Lecture du compte"
      />
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <AccountUsageNotice checkedAt={account.checkedAt} usage={account.usage} />

      {account.identity ? (
        <AccountIdentityCard
          account={account}
          onDisconnect={disconnect}
          onRefresh={refresh}
        />
      ) : (
        <AccountSignInCard
          consoleUrl={account.consoleUrl}
          onConnect={connect}
          onOpenConsole={() => window.pupitre.openUrl(account.consoleUrl)}
          signIn={signIn}
        />
      )}
    </section>
  );
}
