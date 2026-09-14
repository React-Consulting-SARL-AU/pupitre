import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
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
    <Section
      data-devices={devices.status}
      name="devices"
      title={t("account.devices.heading")}
    >
      {devices.status === "reading" || devices.status === "idle" ? (
        <SkeletonRows rows={2} />
      ) : null}

      {devices.status === "failed" ? (
        <ErrorNotice error={devices.error} onRetry={read} />
      ) : null}

      {problem ? <ErrorNotice error={problem} /> : null}

      {devices.status === "read" ? (
        <Panel inset="none" list={devices.devices.length > 0}>
          <AccountDeviceList
            current={current}
            devices={devices.devices}
            onRevoke={revoke}
            revoking={revoking}
          />
        </Panel>
      ) : null}
    </Section>
  );
}
