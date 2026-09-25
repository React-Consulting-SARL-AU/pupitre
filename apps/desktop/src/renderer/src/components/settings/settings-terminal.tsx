import { Button } from "@renderer/components/ui/button";
import { Field, fieldAria } from "@renderer/components/ui/field";
import { NumberField } from "@renderer/components/ui/number-field";
import { Panel } from "@renderer/components/ui/panel";
import { Section } from "@renderer/components/ui/section";
import { Select } from "@renderer/components/ui/select";
import { SwitchLine } from "@renderer/components/ui/switch";
import { useTranslations } from "@renderer/i18n/use-translations";
import { count } from "@renderer/lib/format";
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

// The font is a closed list: a family xterm cannot measure breaks the cell grid.
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
    <Section
      actions={
        <Button
          disabled={unchanged}
          icon={RotateCcw}
          onClick={reset}
          size="sm"
          variant="discreet"
        >
          {t("settings.terminal.reset")}
        </Button>
      }
      name="terminal"
      title={t("settings.section.terminal")}
    >
      <Panel inset="lg">
        <div className="grid gap-6 sm:grid-cols-2">
          <Field
            help={t("settings.terminal.family.help")}
            label={t("settings.terminal.family.label")}
            name="settings.terminal.family"
          >
            <Select
              {...fieldAria({ help: true, name: "settings.terminal.family" })}
              onChange={(fontFamily) => set({ fontFamily })}
              options={TERMINAL_FONT_FAMILIES.map((family) => ({
                label: familyLabel[family],
                value: family,
              }))}
              value={settings.fontFamily}
            />
          </Field>

          <Field
            help={t("settings.terminal.fontSize.help", {
              max: FONT_SIZE_MAX,
              min: FONT_SIZE_MIN,
            })}
            label={t("settings.terminal.fontSize.label")}
            name="settings.terminal.fontSize"
          >
            <NumberField
              {...fieldAria({ help: true, name: "settings.terminal.fontSize" })}
              decrementLabel={t("common.decrease", {
                label: t("settings.terminal.fontSize.label"),
              })}
              incrementLabel={t("common.increase", {
                label: t("settings.terminal.fontSize.label"),
              })}
              max={FONT_SIZE_MAX}
              min={FONT_SIZE_MIN}
              onChange={(fontSize) => set({ fontSize })}
              value={settings.fontSize}
            />
          </Field>

          <Field
            help={t("settings.terminal.scrollback.help", {
              max: count(SCROLLBACK_MAX),
              min: count(SCROLLBACK_MIN),
            })}
            label={t("settings.terminal.scrollback.label")}
            name="settings.terminal.scrollback"
          >
            <NumberField
              {...fieldAria({
                help: true,
                name: "settings.terminal.scrollback",
              })}
              decrementLabel={t("common.decrease", {
                label: t("settings.terminal.scrollback.label"),
              })}
              incrementLabel={t("common.increase", {
                label: t("settings.terminal.scrollback.label"),
              })}
              max={SCROLLBACK_MAX}
              min={SCROLLBACK_MIN}
              onChange={(scrollback) => set({ scrollback })}
              step={SCROLLBACK_STEP}
              value={settings.scrollback}
            />
          </Field>
        </div>

        <div className="mt-6 border-line border-t pt-5">
          <SwitchLine
            checked={settings.cursorBlink}
            label={t("settings.terminal.blink.label")}
            name="settings.terminal.blink"
            onChange={(next) => set({ cursorBlink: next })}
          />
        </div>
      </Panel>
    </Section>
  );
}
