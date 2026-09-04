import { Field, fieldControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import { LOCALE_PREFERENCES, useLocale } from "@renderer/stores/locale";
import { useTheme } from "@renderer/stores/theme";
import { THEME_PREFERENCES, type ThemePreference } from "@shared/appearance";

/**
 * Light, dark, or whatever the system says.
 *
 * The choice lands on `<html data-theme>`, which is what the tokens of
 * `@pupitre/design` key off: the window, the panels and the open terminals turn
 * over on the spot, with nothing reloaded and no session lost.
 */
export function SettingsAppearance() {
  const t = useTranslations();

  const preference = useTheme((s) => s.preference);
  const resolved = useTheme((s) => s.resolved);
  const setPreference = useTheme((s) => s.setPreference);

  const localePreference = useLocale((s) => s.preference);
  const setLocalePreference = useLocale((s) => s.setPreference);

  const themeLabel: Record<ThemePreference, string> = {
    dark: t("settings.theme.dark"),
    light: t("settings.theme.light"),
    system: t("settings.theme.system"),
  };

  const localeLabel = {
    en: t("settings.language.en"),
    fr: t("settings.language.fr"),
    system: t("settings.language.system"),
  } as const;

  return (
    <div className="max-w-sm">
      <p className="text-ink-3 leading-relaxed">
        {t("settings.appearance.intro")}
      </p>

      <div className="mt-4">
        <Field
          help={t("settings.appearance.currently", {
            theme: t(`settings.resolved.${resolved}`),
          })}
          label={t("settings.appearance.themeLabel")}
        >
          <select
            className={fieldControlClass}
            onChange={(event) =>
              setPreference(event.target.value as ThemePreference)
            }
            value={preference}
          >
            {THEME_PREFERENCES.map((option) => (
              <option key={option} value={option}>
                {themeLabel[option]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field
          help={t("settings.language.help")}
          label={t("settings.language.label")}
        >
          <select
            className={fieldControlClass}
            onChange={(event) =>
              setLocalePreference(
                event.target.value as (typeof LOCALE_PREFERENCES)[number]
              )
            }
            value={localePreference}
          >
            {LOCALE_PREFERENCES.map((option) => (
              <option key={option} value={option}>
                {localeLabel[option]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
