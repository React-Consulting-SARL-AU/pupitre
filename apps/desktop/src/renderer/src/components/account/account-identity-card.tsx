import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AccountState } from "@shared/account";
import { LogOut, RotateCw } from "lucide-react";

/**
 * Who this app is signed in as, and which device the platform believes this
 * computer to be. The fingerprint is the device's public half: the private one
 * has never left this folder.
 */
export function AccountIdentityCard({
  account,
  onRefresh,
  onDisconnect,
}: {
  account: AccountState;
  onRefresh: () => void;
  onDisconnect: () => void;
}) {
  const t = useTranslations();

  const { identity, device } = account;

  if (!identity) {
    return null;
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-line bg-surface px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-ink">{identity.name}</p>
          <p className="mt-0.5 font-data text-[11px] text-ink-3">
            {identity.email}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button icon={RotateCw} onClick={onRefresh} size="sm">
            {t("account.identity.refresh")}
          </Button>
          <Button
            icon={LogOut}
            onClick={onDisconnect}
            size="sm"
            variant="danger"
          >
            {t("account.identity.disconnect")}
          </Button>
        </div>
      </div>

      <div className="grid gap-3 border-line border-t pt-3 sm:grid-cols-2">
        <div className="min-w-0">
          <Label>{t("account.identity.organization")}</Label>
          <p className="mt-1 truncate text-ink-2">
            {identity.organization?.name ??
              t("account.identity.noOrganization")}
          </p>
          {identity.role ? (
            <p className="mt-0.5 font-data text-[11px] text-ink-4">
              {identity.role}
            </p>
          ) : null}
        </div>

        <div className="min-w-0">
          <Label>{t("account.identity.device")}</Label>
          <p className="mt-1 truncate text-ink-2">
            {device?.name ?? t("account.identity.deviceUnregistered")}
          </p>
          {device ? (
            <p className="mt-0.5 break-all font-data text-[11px] text-ink-4">
              {device.fingerprint}
            </p>
          ) : null}
        </div>
      </div>

      {account.sealed ? null : (
        <p className="border-line border-t pt-3 text-[11px] text-warn leading-relaxed">
          {t("account.identity.unsealed")}
        </p>
      )}
    </div>
  );
}
