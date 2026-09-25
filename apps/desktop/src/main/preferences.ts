import {
  PREFERENCES_BASELINE,
  PREFERENCES_MIGRATIONS,
} from "./preferences-migrations";
import { type JsonObject, versionedFile } from "./store-migrations";

/** Only what the main process decides without the window; the window never keeps a copy. */
export interface Preferences {
  notifications: boolean;
  launchAtLogin: boolean;
}

const DEFAULTS: Preferences = { launchAtLogin: false, notifications: true };

export interface PreferencesStore {
  read: () => Preferences;
  set: (changes: Partial<Preferences>) => Preferences;
}

function preferencesOf(document: JsonObject): Preferences {
  return {
    launchAtLogin:
      typeof document.launchAtLogin === "boolean"
        ? document.launchAtLogin
        : DEFAULTS.launchAtLogin,
    notifications:
      typeof document.notifications === "boolean"
        ? document.notifications
        : DEFAULTS.notifications,
  };
}

/** A file written by a newer version of the app is read, and never written. */
export function preferencesStore(path: string): PreferencesStore {
  const file = versionedFile({
    baseline: PREFERENCES_BASELINE,
    migrations: PREFERENCES_MIGRATIONS,
    path,
  });
  const held = file.read();

  let current =
    held.status === "read" ? preferencesOf(held.document) : DEFAULTS;

  return {
    read: () => current,
    set(changes) {
      current = { ...current, ...changes };
      file.write({ ...current });

      return current;
    },
  };
}
