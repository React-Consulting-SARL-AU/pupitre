import { app } from "electron";

/** From a dev folder `app.getVersion()` answers Electron's own version, which the agent and updater would use. */
export function appVersion(): string {
  return import.meta.env.MAIN_VITE_APP_VERSION ?? app.getVersion();
}
