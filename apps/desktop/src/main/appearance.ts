import {
  type Appearance,
  readAppearance,
  windowBackground,
} from "@shared/appearance";
import { type BrowserWindow, nativeTheme } from "electron";
import { listen } from "./ipc";
import { shape } from "./ipc-guard";

function isAppearance(value: unknown): value is Appearance {
  return readAppearance(value) !== null;
}

/** The edges seen while the window resizes are painted before the page draws, from the theme the renderer resolved. */
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
  listen("appearance:set", shape(isAppearance), (_event, appearance) =>
    paintAppearance(currentWindow(), appearance)
  );
}
