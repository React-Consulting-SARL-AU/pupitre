import { Field, fieldControlClass } from "@renderer/components/ui/field";
import {
  THEME_PREFERENCES,
  type ThemePreference,
  useTheme,
} from "@renderer/stores/theme";

const THEME_LABEL: Record<ThemePreference, string> = {
  dark: "Sombre",
  light: "Clair",
  system: "Suivre le système",
};

const RESOLVED_LABEL: Record<"light" | "dark", string> = {
  dark: "sombre",
  light: "clair",
};

/**
 * Light, dark, or whatever the system says.
 *
 * The choice lands on `<html data-theme>`, which is what the tokens of
 * `@pupitre/design` key off: the window, the panels and the open terminals turn
 * over on the spot, with nothing reloaded and no session lost.
 */
export function SettingsAppearance() {
  const preference = useTheme((t) => t.preference);
  const resolved = useTheme((t) => t.resolved);
  const setPreference = useTheme((t) => t.setPreference);

  return (
    <div className="max-w-sm">
      <p className="text-ink-3 leading-relaxed">
        L'interface est monochrome par choix : aucune couleur d'accent, et de la
        couleur seulement pour l'état des choses. Le thème s'applique aussitôt,
        terminaux compris.
      </p>

      <div className="mt-4">
        <Field
          help={`actuellement affichée en ${RESOLVED_LABEL[resolved]}`}
          label="Thème"
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
                {THEME_LABEL[option]}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}
