import {
  PREFERENCES_BASELINE,
  PREFERENCES_MIGRATIONS,
} from "./preferences-migrations";
import { type JsonObject, versionedFile } from "./store-migrations";

/**
 * The preferences the main process reads on its own, without the window.
 *
 * The window keeps its own — theme, language, where it was — in its storage;
 * this file holds what decides something outside the window: whether a session
 * that waits for the reader may post a notification, and whether the app opens
 * with the session. One source: the window asks and sets over a channel, and
 * never keeps a copy.
 */

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
