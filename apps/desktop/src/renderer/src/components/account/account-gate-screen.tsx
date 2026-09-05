import { Logo } from "@renderer/components/logo";
import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useAccount } from "@renderer/stores/account";
import type { AccountState } from "@shared/account";
import { Settings as SettingsIcon } from "lucide-react";
import { AccountSignInCard } from "./account-sign-in-card";
import { AccountUsageNotice } from "./account-usage-notice";

/**
 * The first screen of a packaged build, and the last one it falls back to.
 *
 * Nothing of a machine is behind it: no onboarding, no server, no terminal.
 * What it shows is the right to work as the main process read it, the refusal
 * in the guard's own words, and the two ways forward — signing in, or the
 * settings, where a platform address or a proxy is repaired.
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

  return (
    <div className="grid h-full place-items-center overflow-y-auto px-8 py-10">
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <Label>{t("account.gate.eyebrow")}</Label>
        </div>

        <h1 className="mt-3 font-semibold text-2xl text-ink tracking-tight">
          {t("account.gate.title")}
        </h1>

        <p className="mt-2 text-ink-3 leading-relaxed">
          {t("account.gate.body")}
        </p>

        <div className="mt-6 flex flex-col gap-4">
          <AccountUsageNotice
            checkedAt={account.checkedAt}
            usage={account.usage}
          />

          {account.refusal ? (
            <Callout fix={account.refusal.fix} tone="danger">
              {account.refusal.message}
            </Callout>
          ) : null}

          <AccountSignInCard
            consoleUrl={account.consoleUrl}
            onConnect={connect}
            onOpenConsole={() => window.pupitre.openUrl(account.consoleUrl)}
            signIn={signIn}
          />

          <div>
            <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
              {t("account.gate.settings")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
