import { CheckLine } from "@renderer/components/ui/check-line";
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
    <div className="max-w-sm">
      <div>
        {startup === null ? (
          <WaitingLine>{t("settings.startup.reading")}</WaitingLine>
        ) : null}

        {startup?.supported ? (
          <CheckLine
            checked={startup.enabled}
            label={t("settings.startup.label")}
            name="settings.startup"
            onChange={setStartup}
          />
        ) : null}

        {startup && !startup.supported ? (
          <p className="text-ink-2" data-startup="unsupported">
            {t("settings.startup.unsupported")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
