import { Button } from "@renderer/components/ui/button";
import { GateScreen } from "@renderer/components/ui/gate-screen";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Settings as SettingsIcon } from "lucide-react";

/**
 * A machine the reader just told to restart.
 *
 * Its silence is expected, so it is not the unready screen with its refusal
 * and its repair buttons: it is a wait that says whose, what it changes for
 * the reader, and how long it has been. The dashboard comes back on its own
 * with the first `snapshot` that answers.
 */
export function ServerRebootingScreen({
  serverName,
  onSettings,
}: {
  serverName: string;
  onSettings: () => void;
}) {
  const t = useTranslations();

  return (
    <GateScreen
      actions={
        <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
          {t("shell.unready.manageServers")}
        </Button>
      }
      data-rebooting={serverName}
      eyebrow={t("shell.rebooting.eyebrow")}
      title={t("shell.rebooting.title", { name: serverName })}
    >
      <WaitingNotice
        detail={t("shell.rebooting.detail")}
        title={t("shell.rebooting.waiting", { name: serverName })}
      />
    </GateScreen>
  );
}
