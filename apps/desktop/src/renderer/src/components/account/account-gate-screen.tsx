import { Logo } from "@renderer/components/logo";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { Label } from "@renderer/components/ui/label";
import { WindowBand } from "@renderer/components/ui/window-band";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import { useAccount } from "@renderer/stores/account";
import type { AccountState } from "@shared/account";
import { Settings as SettingsIcon } from "lucide-react";
import { AccountGateAside } from "./account-gate-aside";
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
  const bypass = useAccount((state) => state.bypass);

  const platform = new URL(account.consoleUrl).host;
  const development = account.build === "development";

  // A first launch has no account yet: that is the nominal state of this
  // screen, not a fault, and the sign-in card is the whole of what it has to
  // say. A right that expired or was suspended is a fault, and says so.
  const fault = account.usage.status !== "absent";

  return (
    <div className="grid h-full grid-cols-1 lg:grid-cols-[minmax(0,26rem)_1fr]">
      <AccountGateAside platform={platform} />

      <main className="relative grid min-w-0 place-items-center overflow-y-auto px-8 py-12">
        <WindowBand className="absolute inset-x-0 top-0" />

        <div className="clickable w-full max-w-md">
          <div
            className="rise flex items-center gap-2.5 lg:hidden"
            style={riseAt(0)}
          >
            <Logo size={26} />
            <Label>{t("account.gate.eyebrow")}</Label>
          </div>

          <h1
            className="rise mt-3 text-balance font-bold font-display text-3xl text-ink leading-tight tracking-tight lg:mt-0"
            style={riseAt(1)}
          >
            {t("account.gate.title")}
          </h1>

          <p className="rise mt-3 text-ink-3 leading-relaxed" style={riseAt(2)}>
            {t("account.gate.body")}
          </p>

          <div className="mt-8 flex flex-col gap-4">
            <div className="rise" style={riseAt(3)}>
              <AccountSignInCard
                consoleUrl={account.consoleUrl}
                onConnect={connect}
                onOpenConsole={() => window.pupitre.openUrl(account.consoleUrl)}
                signIn={signIn}
              />
            </div>

            {fault ? (
              <div className="rise" style={riseAt(4)}>
                <AccountUsageNotice
                  checkedAt={account.checkedAt}
                  usage={account.usage}
                />
              </div>
            ) : null}

            {fault && account.refusal ? (
              <div className="rise" style={riseAt(5)}>
                <Callout fix={agentText(t, account.refusal).fix} tone="danger">
                  {agentText(t, account.refusal).message}
                </Callout>
              </div>
            ) : null}
          </div>

          <div
            className="rise mt-8 flex flex-wrap items-center justify-between gap-3 border-line border-t pt-5"
            style={riseAt(6)}
          >
            <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
              {t("account.gate.settings")}
            </Button>

            {development ? (
              <Button onClick={bypass} size="sm" variant="discreet">
                {t("account.gate.developmentSkip")}
              </Button>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}
