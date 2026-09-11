/**
 * What a reader may change about every terminal at once, and its bounds.
 *
 * The family is picked from a short list rather than typed: a name xterm
 * cannot measure draws every cell at the wrong width, and the app would rather
 * offer four faces it knows than a field that breaks the grid. The values are
 * validated on the way in — they come off a disk another version may have
 * written — and anything out of bounds falls back to the design's own.
 */

export const TERMINAL_FONT_FAMILIES = [
  "jetbrains",
  "menlo",
  "consolas",
  "system",
] as const;

export type TerminalFontFamily = (typeof TERMINAL_FONT_FAMILIES)[number];

/** Each face with the fallbacks that keep the grid when it is missing. */
export const FONT_STACKS: Record<TerminalFontFamily, string> = {
  consolas: 'Consolas, "Cascadia Mono", "Liberation Mono", monospace',
  jetbrains: '"JetBrains Mono", ui-monospace, Menlo, monospace',
  menlo: 'Menlo, Monaco, "DejaVu Sans Mono", monospace',
  system: "ui-monospace, monospace",
};

export interface TerminalSettings {
  fontSize: number;
  fontFamily: TerminalFontFamily;
  scrollback: number;
  cursorBlink: boolean;
}

export const FONT_SIZE_MIN = 9;
export const FONT_SIZE_MAX = 24;
export const FONT_STEP = 1;

export const SCROLLBACK_MIN = 1000;
export const SCROLLBACK_MAX = 100_000;

export const DEFAULT_TERMINAL_SETTINGS: TerminalSettings = {
  cursorBlink: true,
  fontFamily: "jetbrains",
  fontSize: 13,
  scrollback: 8000,
};

export function isTerminalFontFamily(
  value: unknown
): value is TerminalFontFamily {
  return (
    typeof value === "string" &&
    (TERMINAL_FONT_FAMILIES as readonly string[]).includes(value)
  );
}

function bounded(value: unknown, min: number, max: number): number | null {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= min &&
    value <= max
    ? value
    : null;
}

/** The settings as read back from the disk: what is not valid is the default. */
export function terminalSettingsOf(raw: unknown): TerminalSettings {
  const read = (raw ?? {}) as Partial<Record<keyof TerminalSettings, unknown>>;

  return {
    cursorBlink:
      typeof read.cursorBlink === "boolean"
        ? read.cursorBlink
        : DEFAULT_TERMINAL_SETTINGS.cursorBlink,
    fontFamily: isTerminalFontFamily(read.fontFamily)
      ? read.fontFamily
      : DEFAULT_TERMINAL_SETTINGS.fontFamily,
    fontSize:
      bounded(read.fontSize, FONT_SIZE_MIN, FONT_SIZE_MAX) ??
      DEFAULT_TERMINAL_SETTINGS.fontSize,
    scrollback:
      bounded(read.scrollback, SCROLLBACK_MIN, SCROLLBACK_MAX) ??
      DEFAULT_TERMINAL_SETTINGS.scrollback,
  };
}

/** One step of the type size, within its bounds; zero puts it back where the design put it. */
export function steppedFontSize(current: number, step: -1 | 0 | 1): number {
  if (step === 0) {
    return DEFAULT_TERMINAL_SETTINGS.fontSize;
  }

  return Math.min(
    FONT_SIZE_MAX,
    Math.max(FONT_SIZE_MIN, current + step * FONT_STEP)
  );
}
