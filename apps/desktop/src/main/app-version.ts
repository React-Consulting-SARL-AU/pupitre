import { app } from "electron";

/**
 * The version this app says it is, wherever it is asked.
 *
 * electron-vite stamps it from package.json at build time. `app.getVersion()`
 * reads the same field once packaged, but answers Electron's own version from
 * a development folder — and that is the number the agent would compare its
 * floor against, and the updater would announce.
 */
export function appVersion(): string {
  return import.meta.env.MAIN_VITE_APP_VERSION ?? app.getVersion();
}
