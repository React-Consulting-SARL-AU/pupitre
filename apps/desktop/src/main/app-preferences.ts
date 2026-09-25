import { join } from "node:path";
import type { StartupState } from "@shared/startup";
import { app, Notification } from "electron";
import { currentLanguage } from "./agent";
import { attentionWatcher } from "./attention";
import { broadcast } from "./broadcast";
import { dialogTextIn } from "./dialogs";
import { HARNESSED } from "./harness";
import { handle } from "./ipc";
import { isBoolean, shape } from "./ipc-guard";
import { type PreferencesStore, preferencesStore } from "./preferences";
import { describeSession, onStates } from "./terminals";

const STARTUP_PLATFORMS: NodeJS.Platform[] = ["darwin", "win32"];

let preferences: PreferencesStore | null = null;

/** Read lazily: the data folder is settled only after the command line is. */
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

/** Nothing is registered under the harness: a suite must not leave the test app in the login items. */
function setStartup(enabled: boolean): StartupState {
  preferencesOf().set({ launchAtLogin: enabled });

  if (!HARNESSED && STARTUP_PLATFORMS.includes(process.platform)) {
    app.setLoginItemSettings({ openAtLogin: enabled });
  }

  return startupState();
}

export function registerPreferences(): void {
  handle(
    "notifications:enabled",
    shape(),
    () => preferencesOf().read().notifications
  );
  handle(
    "notifications:set",
    shape(isBoolean),
    (_e, enabled) =>
      preferencesOf().set({ notifications: enabled }).notifications
  );
  handle("startup:state", shape(), () => startupState());
  handle("startup:set", shape(isBoolean), (_e, enabled) => setStartup(enabled));
}

function paintBadge(count: number): void {
  if (process.platform === "darwin") {
    app.dock?.setBadge(count > 0 ? String(count) : "");
  } else {
    app.setBadgeCount(count);
  }
}

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
