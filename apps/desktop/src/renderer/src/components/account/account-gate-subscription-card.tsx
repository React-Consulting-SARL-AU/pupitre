import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Panel } from "@renderer/components/ui/panel";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AccountIdentity } from "@shared/account";
import { ExternalLink, LogOut, RotateCw } from "lucide-react";
import { billingUrlOf } from "./account-subscription-card";

export function AccountGateSubscriptionCard({
  identity,
  reason,
  consoleUrl,
  onOpenConsole,
  onRefresh,
  onDisconnect,
}: {
  identity: AccountIdentity;
  reason: "unsubscribed" | "suspended";
  consoleUrl: string;
  onOpenConsole: (url: string) => void;
  onRefresh: () => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const t = useTranslations();

  return (
    <Panel inset="lg">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          icon={ExternalLink}
          onClick={() => onOpenConsole(billingUrlOf(consoleUrl))}
          variant="inverse"
        >
          {reason === "unsubscribed"
            ? t("account.usage.choosePlan")
            : t("account.usage.manageSubscription")}
        </Button>
        <Button icon={RotateCw} onClick={onRefresh} variant="discreet">
          {t("account.identity.refresh")}
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-line border-t pt-4">
        <p className="min-w-0 truncate font-data text-ink-3 text-small">
          {t("account.gate.signedInAs", { email: identity.email })}
        </p>
        <ConfirmButton
          confirmLabel={t("account.identity.disconnect")}
          icon={LogOut}
          onConfirm={onDisconnect}
          question={t("account.identity.disconnectQuestion")}
          size="sm"
          variant="discreet"
        >
          {t("account.identity.disconnect")}
        </ConfirmButton>
      </div>
    </Panel>
  );
}
