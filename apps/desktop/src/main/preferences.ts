import {
  PREFERENCES_BASELINE,
  PREFERENCES_MIGRATIONS,
} from "./preferences-migrations";
import { type JsonObject, versionedFile } from "./store-migrations";

/** Only what the main process decides without the window; the window never keeps a copy. */
export interface Preferences {
  notifications: boolean;
  launchAtLogin: boolean;
  /** The MCP servers declared to the AI agents installed on this computer. */
  localAgents: boolean;
  /** Their changes run without the allow dialog. */
  localAgentsUnattended: boolean;
}

const DEFAULTS: Preferences = {
  launchAtLogin: false,
  localAgents: false,
  localAgentsUnattended: false,
  notifications: true,
};

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
    localAgents:
      typeof document.localAgents === "boolean"
        ? document.localAgents
        : DEFAULTS.localAgents,
    localAgentsUnattended:
      typeof document.localAgentsUnattended === "boolean"
        ? document.localAgentsUnattended
        : DEFAULTS.localAgentsUnattended,
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
