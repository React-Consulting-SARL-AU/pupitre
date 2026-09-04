import { app } from "electron";
import electronUpdater from "electron-updater";
import {
  type UpdaterEnvironment,
  type UpdaterPlan,
  updaterPlan,
} from "./updater-run";

/** Long enough not to poll for nothing, short enough to catch the day's fix. */
const EVERY_MS = 4 * 60 * 60 * 1000;

function environment(): UpdaterEnvironment {
  return {
    appImage: process.env.APPIMAGE,
    packaged: app.isPackaged,
    platform: process.platform,
    token: import.meta.env.MAIN_VITE_UPDATE_TOKEN,
  };
}

/**
 * The check at start, then the same check every few hours.
 *
 * Nothing of this reaches a screen: the update downloads on its own and is put
 * in place when the app is next quit, so an install never interrupts a terminal
 * that was in the middle of something.
 */
export function startUpdater(): UpdaterPlan {
  const plan = updaterPlan(environment());

  if (!plan.updates) {
    return plan;
  }

  const { autoUpdater } = electronUpdater;

  autoUpdater.setFeedURL(plan.feed);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  const look = () => {
    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // No network, or the feed refused us: the next round will say the same.
    });
  };

  look();

  const timer = setInterval(look, EVERY_MS);
  app.on("will-quit", () => clearInterval(timer));

  return plan;
}
