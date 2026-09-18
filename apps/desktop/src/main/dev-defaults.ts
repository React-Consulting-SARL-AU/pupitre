import { ipcMain } from "electron";
import { devDefaultsFrom } from "./dev-defaults-run";
import { buildKind } from "./platform-url";

/** What a development build fills in for the developer; any other answers null. */
export function registerDevDefaults(): void {
  ipcMain.handle("dev:defaults", () =>
    devDefaultsFrom(process.env, buildKind())
  );
}
