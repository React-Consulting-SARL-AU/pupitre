import { app, shell } from "electron";

/**
 * Whether the app is allowed to take the screen.
 *
 * A scenario run drives the window over the debugger, never over the desktop,
 * so nothing it does should reach whoever is working on the machine — and a
 * suite is a dozen launches in a row. Two gestures jump in front of what is
 * open: the app becoming the active one, and a link handed to another app.
 * Both are held back here rather than at each call site.
 */
export const HARNESSED = process.env.PUPITRE_E2E === "1";

/**
 * Said before the app finishes launching, which is the whole point.
 *
 * macOS makes a freshly launched application the active one on its own, and it
 * does so before `whenReady`: an accessory policy set there arrives after the
 * window has already stolen the focus once per scenario file.
 */
export function stayBehind(): void {
  if (HARNESSED) {
    app.setActivationPolicy?.("accessory");
  }
}

/** A link leaves for the system browser, or for the editor that answers its scheme. */
export function openOutside(url: string): void {
  if (HARNESSED) {
    return;
  }

  shell.openExternal(url);
}
