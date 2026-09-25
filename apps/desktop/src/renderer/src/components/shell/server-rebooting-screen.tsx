import { Button } from "@renderer/components/ui/button";
import { GateScreen } from "@renderer/components/ui/gate-screen";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { useTranslations } from "@renderer/i18n/use-translations";
import { Settings as SettingsIcon } from "lucide-react";

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
