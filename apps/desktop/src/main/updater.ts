import { createHash } from "node:crypto";
import { createReadStream, readFileSync } from "node:fs";
import { basename } from "node:path";
import type { AppAbout, AppUpdateState } from "@shared/app-update";
import { app, autoUpdater as squirrel } from "electron";
import electronUpdater, {
  type AppUpdater,
  type UpdateDownloadedEvent,
} from "electron-updater";
import { AGENT_RELEASE_PUBLIC_KEY } from "./agent-release";
import { appVersion } from "./app-version";
import { broadcast } from "./broadcast";
import { handle } from "./ipc";
import { shape } from "./ipc-guard";
import { trace } from "./trace";
import {
  checkAppArtefact,
  installable,
  signatureUrl,
  type UpdaterEnvironment,
  type UpdaterPlan,
  updaterPlan,
  type VerifiedUpdate,
} from "./updater-run";
import {
  initialUpdateState,
  nextUpdateState,
  type UpdaterEvent,
} from "./updater-state";

const EVERY_MS = 4 * 60 * 60 * 1000;

/** A signature is a hundred bytes: a fetch that takes longer is a bucket that is not answering. */
const SIGNATURE_MS = 20_000;

/** Built on first read: a development build never makes one. */
function updater(): AppUpdater {
  return electronUpdater.autoUpdater;
}

function environment(): UpdaterEnvironment {
  return {
    appImage: process.env.APPIMAGE,
    channel: import.meta.env.MAIN_VITE_UPDATE_CHANNEL,
    downloads: import.meta.env.PUPITRE_DOWNLOADS_URL,
    packaged: app.isPackaged,
    platform: process.platform,
  };
}

function digest(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");

    createReadStream(file)
      .on("data", (chunk) => hash.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(hash.digest("hex")));
  });
}

/** Synchronous: it runs while the app is quitting. */
function digestNow(file: string): string | null {
  try {
    return createHash("sha256").update(readFileSync(file)).digest("hex");
  } catch {
    return null;
  }
}

/** The file electron-updater hands to the installer, from its own record rather than an event's. */
function pendingFile(): string | null {
  const internals = updater() as unknown as {
    downloadedUpdateHelper?: { file: string | null } | null;
  };

  return internals.downloadedUpdateHelper?.file ?? null;
}

async function verifiedDownload(
  info: UpdateDownloadedEvent,
  feedUrl: string
): Promise<VerifiedUpdate | null> {
  const file = basename(info.downloadedFile);
  const entry = info.files.find(
    (candidate) => basename(candidate.url) === file
  );

  if (!entry) {
    return null;
  }

  const response = await fetch(signatureUrl(entry.url, feedUrl), {
    signal: AbortSignal.timeout(SIGNATURE_MS),
  });

  if (!response.ok) {
    return null;
  }

  const signature = await response.text();
  const sha256 = await digest(info.downloadedFile);
  const holds = checkAppArtefact(
    { file, sha256, signature, version: info.version },
    AGENT_RELEASE_PUBLIC_KEY
  );

  return holds
    ? { file: info.downloadedFile, sha256, version: info.version }
    : null;
}

let state: AppUpdateState = initialUpdateState(false);

let verified: VerifiedUpdate | null = null;

let installing = false;

function moved(event: UpdaterEvent): void {
  state = nextUpdateState(state, event);
  broadcast("app-update:changed", state);
}

export function appUpdateState(): AppUpdateState {
  return state;
}

let lookNow: () => void = () => undefined;

export function checkForUpdates(): void {
  lookNow();
}

/** Raising the flag keeps electron-updater's own `quitAndInstall` from asking Squirrel.Mac a second time. */
function stageOnMac(): void {
  updater().autoInstallOnAppQuit = true;
  squirrel.checkForUpdates();
}

function installOnQuit(exitCode: number): void {
  if (
    installing ||
    exitCode !== 0 ||
    !installable(verified, pendingFile(), digestNow)
  ) {
    return;
  }

  installing = true;
  updater().quitAndInstall(true, false);
}

/** `autoInstallOnAppQuit` stays down until the Ed25519 signature published beside a download holds for its bytes. */
export function startUpdater(): UpdaterPlan {
  const plan = updaterPlan(environment());

  state = initialUpdateState(plan.updates);

  const look = () => {
    if (!plan.updates) {
      return;
    }

    updater()
      .checkForUpdates()
      .catch(() => {
        // No network, or the feed refused us: the next round will say the same.
      });
  };

  lookNow = look;

  handle(
    "app:about",
    shape(),
    (): AppAbout => ({
      channel: plan.updates ? plan.channel : null,
      version: appVersion(),
    })
  );
  handle("app-update:state", shape(), () => state);
  handle("app-update:check", shape(), () => {
    look();

    return state;
  });
  handle("app-update:install", shape(), () => {
    if (state.status !== "ready" || installing) {
      return state;
    }

    if (!installable(verified, pendingFile(), digestNow)) {
      verified = null;
      moved({ kind: "changed" });

      return state;
    }

    installing = true;
    updater().quitAndInstall();

    return state;
  });

  if (!plan.updates) {
    return plan;
  }

  const autoUpdater = updater();

  autoUpdater.setFeedURL(plan.feed);
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

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
  autoUpdater.on("error", (failure) => {
    trace("updater", "failed", { reason: failure.message });
    installing = false;
    moved({ kind: "error" });
  });

  let round = 0;

  autoUpdater.on("update-downloaded", (info) => {
    // Synchronous, before electron-updater reads the flag to hand the file on.
    autoUpdater.autoInstallOnAppQuit = false;
    verified = null;
    round += 1;

    const mine = round;

    moved({ kind: "downloaded", version: info.version });

    verifiedDownload(info, plan.feed.url)
      .catch((failure: unknown) => {
        trace("updater", "signature-unread", {
          reason: failure instanceof Error ? failure.message : String(failure),
        });

        return null;
      })
      .then((held) => {
        if (mine !== round) {
          return;
        }

        trace("updater", held ? "verified" : "refused", {
          version: info.version,
        });

        if (!held) {
          moved({ kind: "refused", version: info.version });

          return;
        }

        verified = held;

        if (process.platform === "darwin") {
          stageOnMac();
        }

        moved({ kind: "verified", version: info.version });
      });
  });

  if (process.platform !== "darwin") {
    app.on("quit", (_event, exitCode) => installOnQuit(exitCode));
  }

  look();

  const timer = setInterval(look, EVERY_MS);

  app.on("will-quit", () => clearInterval(timer));

  return plan;
}
