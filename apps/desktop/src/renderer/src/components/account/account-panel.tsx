import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { accountOf, useAccount } from "@renderer/stores/account";
import { useEffect } from "react";
import { AccountDevices } from "./account-devices";
import { AccountIdentityCard } from "./account-identity-card";
import { AccountSignInCard } from "./account-sign-in-card";
import { AccountSubscriptionCard } from "./account-subscription-card";
import { AccountUsageNotice } from "./account-usage-notice";

/**
 * The account section of the settings.
 *
 * It shows the right to work first, because that is what decides whether the
 * app can install anything, and the identity second. Nothing here holds a
 * token: the main process answers with a state, and the state is what is drawn.
 */
export function AccountPanel() {
  const t = useTranslations();

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
    return <WaitingNotice title={t("account.reading.title")} />;
  }

  return (
    <section className="flex flex-col gap-4">
      <AccountUsageNotice
        checkedAt={account.checkedAt}
        onOpenConsole={(url) => window.pupitre.openUrl(url)}
        usage={account.usage}
      />

      {account.identity ? (
        <>
          <AccountIdentityCard
            account={account}
            onDisconnect={disconnect}
            onRefresh={refresh}
          />
          {account.identity.subscription ? (
            <AccountSubscriptionCard
              consoleUrl={account.consoleUrl}
              onOpenConsole={(url) => window.pupitre.openUrl(url)}
              subscription={account.identity.subscription}
            />
          ) : null}
          <AccountDevices current={account.device} />
        </>
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
