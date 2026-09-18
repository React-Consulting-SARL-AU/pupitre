import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { SwitchLine } from "@renderer/components/ui/switch";
import { WaitingLine } from "@renderer/components/ui/waiting-line";
import { useTranslations } from "@renderer/i18n/use-translations";
import { usePreferences } from "@renderer/stores/preferences";
import { useEffect } from "react";

/**
 * Whether the app opens with the session.
 *
 * The main process writes the login item — macOS and Windows keep such a list,
 * Linux has none that is standard — and answers with what it wrote, so the
 * switch never shows a wish the system did not take.
 */
export function SettingsStartup() {
  const t = useTranslations();

  const startup = usePreferences((store) => store.startup);
  const read = usePreferences((store) => store.read);
  const setStartup = usePreferences((store) => store.setStartup);

  useEffect(() => {
    read();
  }, [read]);

  return (
    <Section name="startup" title={t("settings.section.startup")}>
      <Panel inset="lg">
        {startup === null ? (
          <WaitingLine>{t("settings.startup.reading")}</WaitingLine>
        ) : null}

        {startup?.supported ? (
          <SwitchLine
            checked={startup.enabled}
            detail={t("settings.startup.detail")}
            label={t("settings.startup.label")}
            name="settings.startup"
            onChange={setStartup}
          />
        ) : null}

        {startup && !startup.supported ? (
          <p className="text-ink-2 leading-relaxed" data-startup="unsupported">
            {t("settings.startup.unsupported")}
          </p>
        ) : null}
      </Panel>
    </Section>
  );
}
