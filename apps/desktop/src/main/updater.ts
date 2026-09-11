import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { AppAbout, AppUpdateState } from "@shared/app-update";
import { app, ipcMain } from "electron";
import electronUpdater, { type UpdateDownloadedEvent } from "electron-updater";
import { AGENT_RELEASE_PUBLIC_KEY } from "./agent-release";
import { appVersion } from "./app-version";
import { broadcast } from "./broadcast";
import { trace } from "./trace";
import {
  checkAppArtefact,
  signatureUrl,
  type UpdaterEnvironment,
  type UpdaterPlan,
  updaterPlan,
} from "./updater-run";
import {
  initialUpdateState,
  nextUpdateState,
  type UpdaterEvent,
} from "./updater-state";

/** Long enough not to poll for nothing, short enough to catch the day's fix. */
const EVERY_MS = 4 * 60 * 60 * 1000;

/** A signature is a hundred bytes: a fetch that takes longer is a bucket that is not answering. */
const SIGNATURE_MS = 20_000;

function environment(): UpdaterEnvironment {
  return {
    appImage: process.env.APPIMAGE,
    channel: import.meta.env.MAIN_VITE_UPDATE_CHANNEL,
    downloads: import.meta.env.PUPITRE_DOWNLOADS_URL,
    packaged: app.isPackaged,
    platform: process.platform,
  };
}

/**
 * The downloaded AppImage against the signature published beside it.
 *
 * The feed says which file was fetched; the one on disk carries the same name.
 * Anything that fails on the way — no signature, a bucket that does not
 * answer, a file that cannot be read — is a download that is not installed.
 */
async function verifiedDownload(
  info: UpdateDownloadedEvent,
  feedUrl: string
): Promise<boolean> {
  const file = basename(info.downloadedFile);
  const entry =
    info.files.find((candidate) => basename(candidate.url) === file) ??
    info.files[0];

  if (!entry) {
    return false;
  }

  const response = await fetch(signatureUrl(entry.url, feedUrl), {
    signal: AbortSignal.timeout(SIGNATURE_MS),
  });

  if (!response.ok) {
    return false;
  }

  const signature = await response.text();
  const bytes = await readFile(info.downloadedFile);

  return checkAppArtefact(
    { bytes, file, signature, version: info.version },
    AGENT_RELEASE_PUBLIC_KEY
  );
}

let state: AppUpdateState = initialUpdateState(false);

function moved(event: UpdaterEvent): void {
  state = nextUpdateState(state, event);
  broadcast("app-update:changed", state);
}

/** What the About screen reads, and the two gestures it makes. */
export function appUpdateState(): AppUpdateState {
  return state;
}

let lookNow: () => void = () => undefined;

/** The menu's "Check for Updates": the same check, now rather than at the next round. */
export function checkForUpdates(): void {
  lookNow();
}

/**
 * The check at start, then the same check every few hours.
 *
 * Nothing of this reaches a screen: the update downloads on its own and is put
 * in place when the app is next quit, so an install never interrupts a terminal
 * that was in the middle of something.
 *
 * On Linux nothing but this app checks what it downloaded, so the install on
 * quit is withheld until the signature beside the artefact has been verified.
 * The flag is lowered a microtask after the download is announced, once
 * electron-updater has registered its quit handler — it only does so while the
 * flag is up — and raised again only by a signature that holds.
 */
export function startUpdater(): UpdaterPlan {
  const plan = updaterPlan(environment());

  state = initialUpdateState(plan.updates);

  const { autoUpdater } = electronUpdater;

  const look = () => {
    if (!plan.updates) {
      return;
    }

    autoUpdater.checkForUpdatesAndNotify().catch(() => {
      // No network, or the feed refused us: the next round will say the same.
    });
  };

  lookNow = look;

  ipcMain.handle(
    "app:about",
    (): AppAbout => ({
      channel: plan.updates ? plan.feed.channel : null,
      version: appVersion(),
    })
  );
  ipcMain.handle("app-update:state", () => state);
  ipcMain.handle("app-update:check", () => {
    look();

    return state;
  });
  ipcMain.handle("app-update:install", () => {
    if (state.status === "ready") {
      autoUpdater.quitAndInstall();
    }

    return state;
  });

  if (!plan.updates) {
    return plan;
  }

  autoUpdater.setFeedURL(plan.feed);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => moved({ kind: "checking" }));
  autoUpdater.on("update-available", (info) =>
    moved({ kind: "available", version: info.version })
  );
  autoUpdater.on("update-not-available", () =>
    moved({ kind: "not-available" })
  );
  autoUpdater.on("download-progress", (progress) =>
    moved({ kind: "progress", percent: progress.percent })
  );
  autoUpdater.on("update-downloaded", (info) =>
    moved({ kind: "downloaded", version: info.version })
  );
  autoUpdater.on("error", (failure) =>
    moved({ kind: "error", message: failure.message })
  );

  if (process.platform === "linux") {
    autoUpdater.on("update-downloaded", (info) => {
      queueMicrotask(() => {
        autoUpdater.autoInstallOnAppQuit = false;

        verifiedDownload(info, plan.feed.url)
          .catch((failure: unknown) => {
            trace("updater", "signature-unread", {
              reason:
                failure instanceof Error ? failure.message : String(failure),
            });

            return false;
          })
          .then((verified) => {
            trace("updater", verified ? "verified" : "refused", {
              version: info.version,
            });
            autoUpdater.autoInstallOnAppQuit = verified;

            if (!verified) {
              moved({ kind: "refused", version: info.version });
            }
          });
      });
    });
  }

  look();

  const timer = setInterval(look, EVERY_MS);
  app.on("will-quit", () => clearInterval(timer));

  return plan;
}
