import { app, shell } from "electron";
import { HARNESSED } from "./harness";
import { trace } from "./trace";

/** Must run before `whenReady`: macOS activates a freshly launched app before then. */
export function stayBehind(): void {
  if (HARNESSED) {
    app.setActivationPolicy?.("accessory");
  }
}

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
