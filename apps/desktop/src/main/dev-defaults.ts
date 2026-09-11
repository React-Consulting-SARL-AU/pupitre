import { app, ipcMain } from "electron";
import { devDefaultsFrom } from "./dev-defaults-run";

/** What a development build fills in for the developer; a packaged one answers null. */
export function registerDevDefaults(): void {
  ipcMain.handle("dev:defaults", () =>
    devDefaultsFrom(process.env, app.isPackaged)
  );
}
