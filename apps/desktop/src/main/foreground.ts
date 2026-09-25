import { app, shell } from "electron";
import { HARNESSED } from "./harness";
import { trace } from "./trace";

/**
 * Whether the app is allowed to take the screen.
 *
 * Two gestures jump in front of what is open: the app becoming the active
 * one, and a link handed to another app. Under a scenario run both are held
 * back here rather than at each call site.
 */

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

  shell.openExternal(url).catch((failure: unknown) =>
    trace("app", "open-external-failed", {
      reason: failure instanceof Error ? failure.message : String(failure),
    })
  );
}
