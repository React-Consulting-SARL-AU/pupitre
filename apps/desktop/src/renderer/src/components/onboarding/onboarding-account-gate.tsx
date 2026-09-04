import { AccountSignInCard } from "@renderer/components/account/account-sign-in-card";
import { AccountUsageNotice } from "@renderer/components/account/account-usage-notice";
import { PageHeader } from "@renderer/components/ui/page-header";
import { useTranslations } from "@renderer/i18n/use-translations";
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
  const t = useTranslations();

  const signIn = useAccount((state) => state.signIn);
  const connect = useAccount((state) => state.connect);

  return (
    <section className="flex flex-col gap-section">
      <PageHeader
        description={t("onboarding.accountGate.description")}
        eyebrow={t("onboarding.accountGate.eyebrow")}
        title={serverName ?? t("onboarding.accountGate.title")}
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
