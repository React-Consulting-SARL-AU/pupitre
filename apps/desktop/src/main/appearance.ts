import {
  type Appearance,
  readAppearance,
  windowBackground,
} from "@shared/appearance";
import { type BrowserWindow, ipcMain, nativeTheme } from "electron";

/**
 * The native frame follows the theme the reader chose, not the one the system is in.
 *
 * `themeSource` carries the preference so a window left on "system" keeps
 * turning over with it, and the background is painted from the theme the
 * renderer resolved — the colour seen at the edges while the window resizes,
 * before the page has drawn anything.
 */
export function paintAppearance(
  window: BrowserWindow | null,
  appearance: Appearance
): void {
  nativeTheme.themeSource = appearance.preference;

  window?.setBackgroundColor(windowBackground(appearance.resolved));
}

export function registerAppearance(
  currentWindow: () => BrowserWindow | null
): void {
  ipcMain.on("appearance:set", (_event, value: unknown) => {
    const appearance = readAppearance(value);

    if (appearance) {
      paintAppearance(currentWindow(), appearance);
    }
  });
}
