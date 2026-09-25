import { Button } from "@renderer/components/ui/button";
import { GateScreen } from "@renderer/components/ui/gate-screen";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import { useAccount } from "@renderer/stores/account";
import type { AccountState } from "@shared/account";
import { Settings as SettingsIcon } from "lucide-react";
import { AccountGateAside } from "./account-gate-aside";
import { AccountGateSubscriptionCard } from "./account-gate-subscription-card";
import { AccountSignInCard } from "./account-sign-in-card";
import { AccountUsageNotice } from "./account-usage-notice";

/**
 * The first screen of the app, and the last one it falls back to.
 *
 * Nothing of a machine is behind it: no onboarding, no server, no terminal. It
 * opens on every launch that finds nobody signed in on this computer, a
 * development build included — that build keeps its own way past, but it says
 * so out loud instead of skipping the screen.
 */
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

  const platform = new URL(account.consoleUrl).host;
  // The way past is a development build's own right: it is not offered when
  // the platform refused, since taking it would change nothing.
  const skippable =
    account.build === "development" && account.usage.status === "granted";
  const openConsole = (url: string) => window.pupitre.openUrl(url);

  // A first launch has no account yet: that is the nominal state of this
  // screen, not a fault, and the sign-in card is the whole of what it has to
  // say. A right that expired or was suspended is a fault, and says so once:
  // the notice carries the fix, no refusal is repeated under it.
  const fault = account.usage.status !== "absent";

  // An account that is signed in and lacks a plan is not asked to sign in
  // again: the screen names the organization and sends to billing instead.
  const missingPlan =
    account.identity &&
    (account.usage.status === "unsubscribed" ||
      account.usage.status === "suspended")
      ? { identity: account.identity, reason: account.usage.status }
      : null;
  const organization =
    missingPlan?.identity.organization?.name ??
    t("account.identity.noOrganization");

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
            missingPlan
              ? t(`account.gate.${missingPlan.reason}.body`, {
                  org: organization,
                })
              : t("account.gate.body")
          }
          narrow
          title={
            missingPlan
              ? t(`account.gate.${missingPlan.reason}.title`)
              : t("account.gate.title")
          }
        >
          {missingPlan ? (
            <div className="rise" style={riseAt(3)}>
              <AccountGateSubscriptionCard
                consoleUrl={account.consoleUrl}
                identity={missingPlan.identity}
                onDisconnect={disconnect}
                onOpenConsole={openConsole}
                onRefresh={refresh}
                reason={missingPlan.reason}
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

          {fault && !missingPlan ? (
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
