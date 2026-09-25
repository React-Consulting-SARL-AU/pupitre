import { join } from "node:path";
import type { StartupState } from "@shared/startup";
import { app, ipcMain, Notification } from "electron";
import { currentLanguage } from "./agent";
import { attentionWatcher } from "./attention";
import { broadcast } from "./broadcast";
import { dialogTextIn } from "./dialogs";
import { HARNESSED } from "./harness";
import { type PreferencesStore, preferencesStore } from "./preferences";
import { describeSession, onStates } from "./terminals";

/**
 * What the app does outside its window, as the reader set it: a notification
 * when a session waits, and opening with the session.
 */

const STARTUP_PLATFORMS: NodeJS.Platform[] = ["darwin", "win32"];

let preferences: PreferencesStore | null = null;

/** Read once the data folder is settled, which is after the command line is. */
function preferencesOf(): PreferencesStore {
  preferences ??= preferencesStore(
    join(app.getPath("userData"), "preferences.json")
  );

  return preferences;
}

function startupState(): StartupState {
  return {
    enabled: preferencesOf().read().launchAtLogin,
    supported: STARTUP_PLATFORMS.includes(process.platform),
  };
}

/**
 * The file is the wish, the system's list of login items is where it lands.
 * Under the harness nothing is registered: a suite is a dozen launches, and
 * none of them should leave the test app in the reader's login items.
 */
function setStartup(enabled: boolean): StartupState {
  preferencesOf().set({ launchAtLogin: enabled });

  if (!HARNESSED && STARTUP_PLATFORMS.includes(process.platform)) {
    app.setLoginItemSettings({ openAtLogin: enabled });
  }

  return startupState();
}

export function registerPreferences(): void {
  ipcMain.handle(
    "notifications:enabled",
    () => preferencesOf().read().notifications
  );
  ipcMain.handle(
    "notifications:set",
    (_e, enabled: unknown) =>
      preferencesOf().set({ notifications: enabled === true }).notifications
  );
  ipcMain.handle("startup:state", () => startupState());
  ipcMain.handle("startup:set", (_e, enabled: unknown) =>
    setStartup(enabled === true)
  );
}

function paintBadge(count: number): void {
  if (process.platform === "darwin") {
    app.dock?.setBadge(count > 0 ? String(count) : "");
  } else {
    app.setBadgeCount(count);
  }
}

/**
 * A session that starts waiting while the reader is elsewhere says so once,
 * outside the window. The Dock counts the ones still waiting. Neither happens
 * under the harness, where nothing may reach the screen.
 */
export function watchAttention({
  bringToFront,
  focused,
}: {
  bringToFront: () => void;
  focused: () => boolean;
}): void {
  if (HARNESSED) {
    return;
  }

  onStates(
    attentionWatcher({
      allowed: () => preferencesOf().read().notifications,
      badge: paintBadge,
      focused,
      notify: (id) => {
        const session = describeSession(id);

        if (!(session && Notification.isSupported())) {
          return;
        }

        const language = currentLanguage();
        const notice = new Notification({
          body: dialogTextIn(language, "attentionBody", {
            title: [session.kind, session.project].filter(Boolean).join(" · "),
          }),
          title: dialogTextIn(language, "attentionTitle"),
        });

        notice.on("click", () => {
          bringToFront();
          broadcast("terminal-wanted", { id });
        });
        notice.show();
      },
    })
  );
}
