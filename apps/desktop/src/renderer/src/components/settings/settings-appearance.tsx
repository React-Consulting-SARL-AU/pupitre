import { Field, fieldAria } from "@renderer/components/ui/field";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { Select } from "@renderer/components/ui/select";
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
    <Section name="appearance" title={t("settings.section.appearance")}>
      <Panel inset="lg">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            help={t("settings.appearance.currently", {
              theme: t(`settings.resolved.${resolved}`),
            })}
            label={t("settings.appearance.themeLabel")}
            name="settings.theme"
          >
            <Select
              {...fieldAria({ help: true, name: "settings.theme" })}
              onChange={setPreference}
              options={THEME_PREFERENCES.map((option) => ({
                label: themeLabel[option],
                value: option,
              }))}
              value={preference}
            />
          </Field>

          <Field
            help={t("settings.language.help")}
            label={t("settings.language.label")}
            name="settings.language"
          >
            <Select
              {...fieldAria({ help: true, name: "settings.language" })}
              onChange={setLocalePreference}
              options={LOCALE_PREFERENCES.map((option) => ({
                label: localeLabel[option],
                value: option,
              }))}
              value={localePreference}
            />
          </Field>
        </div>
      </Panel>
    </Section>
  );
}
