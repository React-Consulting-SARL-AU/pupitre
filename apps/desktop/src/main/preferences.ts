import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
  PREFERENCES_BASELINE,
  PREFERENCES_MIGRATIONS,
} from "./preferences-migrations";
import {
  expectedRevision,
  type JsonObject,
  keepCopy,
  migrate,
  REVISION_KEY,
} from "./store-migrations";

/**
 * The preferences the main process reads on its own, without the window.
 *
 * The window keeps its own — theme, language, where it was — in its storage;
 * this file holds what decides something outside the window: whether a session
 * that waits for the reader may post a notification, and whether the app opens
 * with the session. One source: the window asks and sets over a channel, and
 * never keeps a copy.
 */

const VERSION = Math.max(
  PREFERENCES_BASELINE,
  expectedRevision(PREFERENCES_MIGRATIONS)
);

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

export function readPreferences(path: string): {
  preferences: Preferences;
  revision: number;
} {
  if (!existsSync(path)) {
    return { preferences: DEFAULTS, revision: VERSION };
  }

  try {
    const raw = JSON.parse(readFileSync(path, "utf8")) as JsonObject;
    const from = typeof raw[REVISION_KEY] === "number" ? raw[REVISION_KEY] : 0;
    const migrated = migrate(raw, PREFERENCES_MIGRATIONS);

    if (migrated.applied.length > 0) {
      keepCopy(path, from);
    }

    return {
      preferences: preferencesOf(migrated.document),
      revision: migrated.revision,
    };
  } catch {
    return { preferences: DEFAULTS, revision: VERSION };
  }
}

/** A file written by a newer version of the app is read, and never written. */
export function preferencesStore(path: string): PreferencesStore {
  const held = readPreferences(path);
  const frozen = held.revision > VERSION;
  let current = held.preferences;

  return {
    read: () => current,
    set(changes) {
      current = { ...current, ...changes };

      if (!frozen) {
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(
          path,
          `${JSON.stringify({ [REVISION_KEY]: VERSION, ...current }, null, 2)}\n`,
          "utf8"
        );
      }

      return current;
    },
  };
}
