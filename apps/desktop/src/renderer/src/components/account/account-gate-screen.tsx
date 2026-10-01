import { LEGAL_CONTACTS } from "@pupitre/shared/legal";
import { FREE_SERVERS } from "@pupitre/shared/plans";
import { Button } from "@renderer/components/ui/button";
import { GateScreen } from "@renderer/components/ui/gate-screen";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import { useContactSupport } from "@renderer/lib/use-contact-support";
import { useAccount } from "@renderer/stores/account";
import type { AccountState } from "@shared/account";
import { Settings as SettingsIcon } from "lucide-react";
import { AccountGateAside } from "./account-gate-aside";
import { AccountGateLicenseCard } from "./account-gate-license-card";
import { AccountSignInCard } from "./account-sign-in-card";
import { AccountUsageNotice } from "./account-usage-notice";

export function AccountGateScreen({
  account,
  onSettings,
}: {
  account: AccountState;
  onSettings: () => void;
}) {
  const t = useTranslations();

  const signIn = useAccount((state) => state.signIn);
  const connect = useAccount((state) => state.connect);
  const cancelSignIn = useAccount((state) => state.cancelSignIn);
  const refresh = useAccount((state) => state.refresh);
  const disconnect = useAccount((state) => state.disconnect);
  const bypass = useAccount((state) => state.bypass);
  const contactSupport = useContactSupport();

  const platform = new URL(account.consoleUrl).host;
  // Not offered once the platform refused: skipping would change nothing.
  const skippable =
    account.build === "development" && account.usage.status === "granted";
  const openConsole = (url: string) => window.pupitre.openUrl(url);

  // No account yet is this screen's nominal state, not a fault to report.
  const fault = account.usage.status !== "absent";

  const { usage } = account;
  const blocked =
    account.identity &&
    (usage.status === "unlicensed" || usage.status === "suspended")
      ? { identity: account.identity, reason: usage.status }
      : null;
  const blockedCopy = {
    free: FREE_SERVERS,
    org:
      blocked?.identity.organization?.name ??
      t("account.identity.noOrganization"),
    support: LEGAL_CONTACTS.support,
    used: usage.status === "unlicensed" ? usage.servers.used : 0,
  };

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <AccountGateAside platform={platform} />

      <main className="min-w-0">
        <GateScreen
          actions={
            <>
              <Button
                icon={SettingsIcon}
                onClick={onSettings}
                variant="discreet"
              >
                {t("account.gate.settings")}
              </Button>

              {skippable ? (
                <Button
                  className="ml-auto"
                  onClick={bypass}
                  size="sm"
                  variant="discreet"
                >
                  {t("account.gate.developmentSkip")}
                </Button>
              ) : null}
            </>
          }
          actionsAt={5}
          beside
          eyebrow={t("account.gate.eyebrow")}
          lead={
            blocked
              ? t(`account.gate.${blocked.reason}.body`, blockedCopy)
              : t("account.gate.body")
          }
          narrow
          title={
            blocked
              ? t(`account.gate.${blocked.reason}.title`)
              : t("account.gate.title")
          }
        >
          {blocked ? (
            <div className="rise" style={riseAt(3)}>
              <AccountGateLicenseCard
                identity={blocked.identity}
                onContactSupport={contactSupport}
                onDisconnect={disconnect}
                onRefresh={refresh}
              />
            </div>
          ) : (
            <div className="rise" style={riseAt(3)}>
              <AccountSignInCard
                consoleUrl={account.consoleUrl}
                onCancel={cancelSignIn}
                onConnect={connect}
                onOpenUrl={openConsole}
                signIn={signIn}
              />
            </div>
          )}

          {fault && !blocked ? (
            <div className="rise" style={riseAt(4)}>
              <AccountUsageNotice
                checkedAt={account.checkedAt}
                onOpenConsole={openConsole}
                usage={account.usage}
              />
            </div>
          ) : null}
        </GateScreen>
      </main>
    </div>
  );
}
