import { Section } from "@renderer/components/ui/section";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { accountOf, useAccount } from "@renderer/stores/account";
import { useEffect } from "react";
import { AccountDevices } from "./account-devices";
import { AccountIdentityCard } from "./account-identity-card";
import { AccountKeyApprovals } from "./account-key-approvals";
import { AccountSignInCard } from "./account-sign-in-card";
import { AccountSubscriptionCard } from "./account-subscription-card";
import { AccountUsageNotice } from "./account-usage-notice";

export function AccountPanel() {
  const t = useTranslations();

  const view = useAccount((state) => state.view);
  const signIn = useAccount((state) => state.signIn);
  const read = useAccount((state) => state.read);
  const connect = useAccount((state) => state.connect);
  const cancelSignIn = useAccount((state) => state.cancelSignIn);
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
    <>
      <Section name="usage" title={t("account.usage.title")}>
        <AccountUsageNotice
          checkedAt={account.checkedAt}
          onOpenConsole={(url) => window.pupitre.openUrl(url)}
          usage={account.usage}
        />
        {account.identity?.subscription ? (
          <AccountSubscriptionCard
            consoleUrl={account.consoleUrl}
            onOpenConsole={(url) => window.pupitre.openUrl(url)}
            subscription={account.identity.subscription}
          />
        ) : null}
      </Section>

      {account.identity ? (
        <>
          <AccountIdentityCard
            account={account}
            onDisconnect={disconnect}
            onRefresh={refresh}
          />
          <AccountKeyApprovals />
          <AccountDevices current={account.device} />
        </>
      ) : (
        <AccountSignInCard
          consoleUrl={account.consoleUrl}
          onCancel={cancelSignIn}
          onConnect={connect}
          onOpenUrl={(url) => window.pupitre.openUrl(url)}
          signIn={signIn}
        />
      )}
    </>
  );
}
