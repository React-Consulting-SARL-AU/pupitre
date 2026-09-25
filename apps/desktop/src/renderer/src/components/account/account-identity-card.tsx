import { Button } from "@renderer/components/ui/button";
import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { Fact, FactList } from "@renderer/components/ui/fact";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { useTranslations } from "@renderer/i18n/use-translations";
import { roleLabel } from "@renderer/lib/roles";
import type { AccountState } from "@shared/account";
import { LogOut, RotateCw } from "lucide-react";

/**
 * Who this app is signed in as, and in which organization. The device this
 * computer is stands in the devices list below, marked as this one, so it is
 * not said twice.
 */
export function AccountIdentityCard({
  account,
  onRefresh,
  onDisconnect,
}: {
  account: AccountState;
  onRefresh: () => void;
  /** Answer with the promise of the sign-out and the button waits on it. */
  onDisconnect: () => unknown;
}) {
  const t = useTranslations();

  const { identity } = account;

  if (!identity) {
    return null;
  }

  return (
    <Section
      actions={
        <>
          <Button icon={RotateCw} onClick={onRefresh} size="sm">
            {t("account.identity.refresh")}
          </Button>
          <ConfirmButton
            confirmLabel={t("account.identity.disconnect")}
            icon={LogOut}
            onConfirm={onDisconnect}
            question={t("account.identity.disconnectQuestion")}
            size="sm"
          >
            {t("account.identity.disconnect")}
          </ConfirmButton>
        </>
      }
      name="identity"
      title={t("account.identity.title")}
    >
      <Panel className="flex flex-col gap-4">
        <FactList>
          <Fact
            detail={identity.email}
            label={t("account.identity.name")}
            prose
          >
            {identity.name}
          </Fact>
          <Fact
            detail={identity.role ? roleLabel(t, identity.role) : undefined}
            label={t("account.identity.organization")}
            prose
          >
            {identity.organization?.name ??
              t("account.identity.noOrganization")}
          </Fact>
        </FactList>

        {account.sealed ? null : (
          <p className="border-line border-t pt-3 text-small text-warn leading-relaxed">
            {t("account.identity.unsealed")}
          </p>
        )}
      </Panel>
    </Section>
  );
}
