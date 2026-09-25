import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SwitchLine } from "@renderer/components/ui/switch";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { usePreferences } from "@renderer/stores/preferences";
import { useEffect } from "react";

export function SettingsNotifications() {
  const t = useTranslations();

  const notifications = usePreferences((store) => store.notifications);
  const read = usePreferences((store) => store.read);
  const setNotifications = usePreferences((store) => store.setNotifications);

  useEffect(() => {
    read();
  }, [read]);

  return (
    <Section name="notifications" title={t("settings.section.notifications")}>
      <Panel inset="lg">
        {notifications === null ? (
          <WaitingLine>{t("settings.notifications.reading")}</WaitingLine>
        ) : (
          <SwitchLine
            checked={notifications}
            detail={t("settings.notifications.detail")}
            label={t("settings.notifications.label")}
            name="settings.notifications"
            onChange={setNotifications}
          />
        )}
      </Panel>
    </Section>
  );
}
