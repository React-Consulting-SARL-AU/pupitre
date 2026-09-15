import { ConfirmButton } from "@renderer/components/ui/confirm-button";
import { CountPill } from "@renderer/components/ui/count-pill";
import { EmptyState } from "@renderer/components/ui/empty-state";
import { useTranslations } from "@renderer/i18n/use-translations";
import type { AccountDevice } from "@shared/account";
import { Laptop, Trash2 } from "lucide-react";

/**
 * The devices as rows: this computer marked and left alone, every other one
 * with the gesture that revokes it, asked twice and naming the machine.
 */
export function AccountDeviceList({
  devices,
  current,
  revoking,
  onRevoke,
}: {
  devices: readonly AccountDevice[];
  /** The device this computer is, as the platform named it. */
  current: AccountDevice | null;
  /** The device a revocation is under way on. */
  revoking: string | null;
  onRevoke: (deviceId: string) => Promise<void>;
}) {
  const t = useTranslations();

  if (devices.length === 0) {
    return <EmptyState icon={Laptop} title={t("account.devices.none")} />;
  }

  return (
    <ul className="contents">
      {devices.map((device) => {
        const self = device.id === current?.id;

        return (
          <li
            className="flex items-center gap-3 px-4 py-3"
            data-device={device.id}
            key={device.id}
          >
            <Laptop
              className="shrink-0 text-ink-3"
              size={14}
              strokeWidth={1.5}
            />

            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] text-ink">
                {device.name}
                {self ? (
                  <CountPill className="ml-2">
                    {t("account.devices.thisComputer")}
                  </CountPill>
                ) : null}
              </p>
              <p className="truncate font-data text-[11px] text-ink-3">
                {device.fingerprint}
              </p>
            </div>

            {self ? (
              <span className="text-[12px] text-ink-3">
                {t("account.devices.self")}
              </span>
            ) : (
              <ConfirmButton
                confirmLabel={t("account.devices.revoke")}
                disabled={revoking !== null && revoking !== device.id}
                icon={Trash2}
                onConfirm={() => onRevoke(device.id)}
                question={t("account.devices.revokeQuestion", {
                  name: device.name,
                })}
                size="sm"
              >
                {t("account.devices.revoke")}
              </ConfirmButton>
            )}
          </li>
        );
      })}
    </ul>
  );
}
