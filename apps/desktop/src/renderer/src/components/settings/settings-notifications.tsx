import { CheckLine } from "@renderer/components/ui/check-line";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { usePreferences } from "@renderer/stores/preferences";
import { useEffect } from "react";

/**
 * Whether a session that waits for the reader may say so outside the window.
 *
 * The main process posts the notification and paints the badge, so it is the
 * one that keeps the answer: the switch asks it and draws what it wrote back.
 */
export function SettingsNotifications() {
  const t = useTranslations();

  const notifications = usePreferences((store) => store.notifications);
  const read = usePreferences((store) => store.read);
  const setNotifications = usePreferences((store) => store.setNotifications);

  useEffect(() => {
    read();
  }, [read]);

  return (
    <div className="max-w-sm">
      <div>
        {notifications === null ? (
          <WaitingLine>{t("settings.notifications.reading")}</WaitingLine>
        ) : (
          <CheckLine
            checked={notifications}
            label={t("settings.notifications.label")}
            name="settings.notifications"
            onChange={setNotifications}
          />
        )}
      </div>
    </div>
  );
}
