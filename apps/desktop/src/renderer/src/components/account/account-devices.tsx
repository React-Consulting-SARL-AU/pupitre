import { ErrorNotice } from "@renderer/components/ui/error-notice";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SkeletonRows } from "@renderer/components/ui/skeleton";
import { useTranslations } from "@renderer/i18n/use-translations";
import { useAccount } from "@renderer/stores/account";
import type { AccountDevice } from "@shared/account";
import { useEffect } from "react";
import { AccountDeviceList } from "./account-device-list";

export function AccountDevices({ current }: { current: AccountDevice | null }) {
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
