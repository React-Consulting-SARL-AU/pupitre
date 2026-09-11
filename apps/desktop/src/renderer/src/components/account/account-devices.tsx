import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Label } from "@renderer/components/ui/label";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useAccount } from "@renderer/stores/account";
import type { AccountDevice } from "@shared/account";
import { useEffect } from "react";
import { AccountDeviceList } from "./account-device-list";

/**
 * The computers this account signed in from, and the gesture that lets one go.
 *
 * Every device holds a key the platform pushes on the granted servers; a
 * laptop that left the team keeps opening them until it is revoked here or in
 * the console. This computer is in the list and cannot revoke itself — signing
 * out is that gesture, and it says what it closes.
 */
export function AccountDevices({
  current,
}: {
  /** The device this computer is, as the platform named it. */
  current: AccountDevice | null;
}) {
  const t = useTranslations();

  const devices = useAccount((store) => store.devices);
  const revoking = useAccount((store) => store.revoking);
  const problem = useAccount((store) => store.deviceProblem);
  const read = useAccount((store) => store.readDevices);
  const revoke = useAccount((store) => store.revokeDevice);

  useEffect(() => {
    read();
  }, [read]);

  return (
    <section
      className="flex flex-col gap-3 rounded-md border border-line bg-surface px-4 py-4"
      data-devices={devices.status}
    >
      <Label>{t("account.devices.heading")}</Label>

      {devices.status === "reading" || devices.status === "idle" ? (
        <SkeletonRows framed={false} rows={2} />
      ) : null}

      {devices.status === "failed" ? (
        <ErrorNotice error={devices.error} onRetry={read} />
      ) : null}

      {problem ? <ErrorNotice error={problem} /> : null}

      {devices.status === "read" ? (
        <AccountDeviceList
          current={current}
          devices={devices.devices}
          onRevoke={revoke}
          revoking={revoking}
        />
      ) : null}
    </section>
  );
}
