import { Button } from "@renderer/components/ui/button";
import { Callout } from "@renderer/components/ui/callout";
import { CopyField } from "@renderer/components/ui/copy-field";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { SignInState } from "@renderer/stores/account";
import { LogIn, RotateCw } from "lucide-react";

/**
 * The device flow, as it is lived: a code to read, a browser that opens on it,
 * and a wait that says what it is waiting for. The code stays on screen until
 * someone approves it, because that is the one thing to type over there.
 */
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
      <div className="flex flex-wrap items-center gap-2">
        <Button icon={LogIn} onClick={onConnect} variant="inverse">
          {t("account.signIn.connect")}
        </Button>
        <Button onClick={onOpenConsole} variant="discreet">
          {t("account.signIn.openConsole")}
        </Button>
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
        fix={signIn.error.fix}
        tone="danger"
      >
        {signIn.error.message}
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
    <div className="flex flex-col gap-4">
      <WaitingNotice
        detail={t("account.signIn.waitingDetail", { url: consoleUrl })}
        note={t("account.signIn.waitingNote")}
        title={t("account.signIn.waitingTitle")}
      />

      <CopyField
        help={t("account.signIn.codeHelp")}
        label={t("account.signIn.codeLabel")}
        value={signIn.userCode}
      />

      <div>
        <Button onClick={onOpenConsole} variant="discreet">
          {t("account.signIn.reopenBrowser")}
        </Button>
      </div>
    </div>
  );
}
