import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { StatusDot } from "@renderer/components/ui/status-dot";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { agentText } from "@renderer/i18n/agent-error";
import { useTranslations } from "@renderer/i18n/use-translations";
import { riseAt } from "@renderer/lib/motion";
import type { SignInState } from "@renderer/stores/account";
import { ExternalLink, LogIn, RotateCw } from "lucide-react";
import { AccountCode } from "./account-code";

/**
 * The device flow, as it is lived: a code to read, a browser that opens on it,
 * and a wait that says what it is waiting for. The code stays on screen until
 * someone approves it, because that is the one thing to type over there.
 */

const STEPS = ["browser", "approve", "back"] as const;

export function AccountSignInCard({
  signIn,
  consoleUrl,
  onConnect,
  onOpenConsole,
}: {
  signIn: SignInState;
  consoleUrl: string;
  onConnect: () => void;
  onOpenConsole: () => void;
}) {
  const t = useTranslations();

  if (signIn.status === "idle") {
    return (
      <div className="elevation-raised rounded-md border border-line bg-surface px-5 py-5">
        <div className="flex flex-wrap items-center gap-2">
          <Button icon={LogIn} onClick={onConnect} variant="inverse">
            {t("account.signIn.connect")}
          </Button>
          <Button
            icon={ExternalLink}
            onClick={onOpenConsole}
            variant="discreet"
          >
            {t("account.signIn.openConsole")}
          </Button>
        </div>
      </div>
    );
  }

  if (signIn.status === "failed") {
    return (
      <Callout
        action={
          <Button icon={RotateCw} onClick={onConnect} size="sm">
            {t("common.retry")}
          </Button>
        }
        fix={agentText(t, signIn.error).fix}
        tone="danger"
      >
        {agentText(t, signIn.error).message}
      </Callout>
    );
  }

  if (signIn.status === "starting") {
    return (
      <WaitingNotice
        detail={t("account.signIn.startingDetail")}
        title={t("account.signIn.startingTitle")}
      />
    );
  }

  return (
    <div
      aria-busy="true"
      className="elevation-raised flex flex-col gap-5 rounded-md border border-line bg-surface px-5 py-5"
    >
      <AccountCode
        help={t("account.signIn.codeHelp")}
        label={t("account.signIn.codeLabel")}
        value={signIn.userCode}
      />

      <ol className="flex flex-col gap-2.5 border-line border-t pt-4">
        {STEPS.map((step, index) => (
          <li className="rise flex gap-2.5" key={step} style={riseAt(index)}>
            <span className="mt-1">
              <StatusDot
                shape={step === "back" ? "empty" : "filled"}
                size={9}
              />
            </span>
            <p className="text-[12px] text-ink-2 leading-relaxed">
              {t(`account.signIn.step.${step}`, { url: consoleUrl })}
            </p>
          </li>
        ))}
      </ol>

      <div>
        <Button icon={ExternalLink} onClick={onOpenConsole} size="sm">
          {t("account.signIn.reopenBrowser")}
        </Button>
      </div>
    </div>
  );
}
