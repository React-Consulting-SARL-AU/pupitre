import { Logo } from "@renderer/components/logo";
import { Button } from "@renderer/components/ui/button";
import { Label } from "@renderer/components/ui/label";
import { WaitingNotice } from "@renderer/components/ui/waiting-notice";
import { WindowBand } from "@renderer/components/ui/window-band";
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
    <div className="relative grid h-full place-items-center px-8">
      <WindowBand className="absolute inset-x-0 top-0" />

      <div className="clickable w-full max-w-xl" data-rebooting={serverName}>
        <div className="flex items-center gap-2.5">
          <Logo size={26} />
          <Label>{t("shell.rebooting.eyebrow")}</Label>
        </div>

        <h1 className="mt-3 font-bold font-display text-2xl text-ink tracking-tight">
          {t("shell.rebooting.title", { name: serverName })}
        </h1>

        <div className="mt-6">
          <WaitingNotice
            detail={t("shell.rebooting.detail")}
            title={t("shell.rebooting.waiting", { name: serverName })}
          />
        </div>

        <div className="mt-6">
          <Button icon={SettingsIcon} onClick={onSettings} variant="discreet">
            {t("shell.unready.manageServers")}
          </Button>
        </div>
      </div>
    </div>
  );
}
