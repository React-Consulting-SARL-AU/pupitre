import { Button } from "@renderer/components/ui/button";
import { CheckLine } from "@renderer/components/ui/check-line";
import { Field, fieldControlClass } from "@renderer/components/ui/field";
import { useTranslations } from "@renderer/i18n/use-translations";
import {
  DEFAULT_TERMINAL_SETTINGS,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  SCROLLBACK_MAX,
  SCROLLBACK_MIN,
  TERMINAL_FONT_FAMILIES,
  type TerminalFontFamily,
} from "@renderer/lib/terminal-settings";
import { useTerminalSettings } from "@renderer/stores/terminal-settings";
import { RotateCcw } from "lucide-react";

const SCROLLBACK_STEP = 1000;

/**
 * The look of every terminal, chosen once.
 *
 * Each choice lands on the open sessions the moment it is made — xterm draws
 * on a canvas and is handed the value by hand — so nothing here asks to be
 * saved or applied. The face is a list, never a field: a name xterm cannot
 * measure breaks the grid of every cell.
 */
export function SettingsTerminal() {
  const t = useTranslations();

  const settings = useTerminalSettings((store) => store.settings);
  const set = useTerminalSettings((store) => store.set);
  const reset = useTerminalSettings((store) => store.reset);

  const familyLabel: Record<TerminalFontFamily, string> = {
    consolas: t("settings.terminal.family.consolas"),
    jetbrains: t("settings.terminal.family.jetbrains"),
    menlo: t("settings.terminal.family.menlo"),
    system: t("settings.terminal.family.system"),
  };

  const unchanged =
    settings.fontSize === DEFAULT_TERMINAL_SETTINGS.fontSize &&
    settings.fontFamily === DEFAULT_TERMINAL_SETTINGS.fontFamily &&
    settings.scrollback === DEFAULT_TERMINAL_SETTINGS.scrollback &&
    settings.cursorBlink === DEFAULT_TERMINAL_SETTINGS.cursorBlink;

  return (
    <div className="max-w-sm">
      <div>
        <Field
          help={t("settings.terminal.fontSize.help", {
            max: FONT_SIZE_MAX,
            min: FONT_SIZE_MIN,
          })}
          label={t("settings.terminal.fontSize.label")}
          name="settings.terminal.fontSize"
        >
          <input
            className={fieldControlClass}
            id="settings.terminal.fontSize"
            max={FONT_SIZE_MAX}
            min={FONT_SIZE_MIN}
            onChange={(event) =>
              set({ fontSize: Number.parseInt(event.target.value, 10) })
            }
            step={1}
            type="number"
            value={settings.fontSize}
          />
        </Field>
      </div>

      <div className="mt-4">
        <Field
          help={t("settings.terminal.family.help")}
          label={t("settings.terminal.family.label")}
          name="settings.terminal.family"
        >
          <select
            className={fieldControlClass}
            id="settings.terminal.family"
            onChange={(event) =>
              set({ fontFamily: event.target.value as TerminalFontFamily })
            }
            value={settings.fontFamily}
          >
            {TERMINAL_FONT_FAMILIES.map((family) => (
              <option key={family} value={family}>
                {familyLabel[family]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <div className="mt-4">
        <Field
          help={t("settings.terminal.scrollback.help", {
            max: SCROLLBACK_MAX,
            min: SCROLLBACK_MIN,
          })}
          label={t("settings.terminal.scrollback.label")}
          name="settings.terminal.scrollback"
        >
          <input
            className={fieldControlClass}
            id="settings.terminal.scrollback"
            max={SCROLLBACK_MAX}
            min={SCROLLBACK_MIN}
            onChange={(event) =>
              set({ scrollback: Number.parseInt(event.target.value, 10) })
            }
            step={SCROLLBACK_STEP}
            type="number"
            value={settings.scrollback}
          />
        </Field>
      </div>

      <div className="mt-4">
        <CheckLine
          checked={settings.cursorBlink}
          label={t("settings.terminal.blink.label")}
          name="settings.terminal.blink"
          onChange={(next) => set({ cursorBlink: next })}
        />
      </div>

      <div className="mt-6">
        <Button
          disabled={unchanged}
          icon={RotateCcw}
          onClick={reset}
          size="sm"
          variant="discreet"
        >
          {t("settings.terminal.reset")}
        </Button>
      </div>
    </div>
  );
}
