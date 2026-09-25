// Every access is wrapped: localStorage throws in some contexts, and a convenience must never stop the app starting.
const STORAGE_ENTRY = "pupitre.navigation.v1";

/** All optional: another app version may have written it, and the store validates each field. */
export interface RememberedTerminal {
  id?: string;
  kind?: string;
  title?: string;
  project?: string | null;
  dir?: string | null;
  session?: string | null;
}

export interface Navigation {
  view?: string;
  project?: string;
  tabs?: Record<string, string>;
  /** Restored closed: reattaching every session at launch would open a connection each. */
  terminals?: RememberedTerminal[];
  terminalTabs?: Record<string, string>;
  terminal?: string;
  theme?: string;
  locale?: string;
  files?: { hidden?: boolean; sort?: string };
  terminalSettings?: {
    fontSize?: number;
    fontFamily?: string;
    scrollback?: number;
    cursorBlink?: boolean;
  };
}

export function readNavigation(): Navigation {
  try {
    const raw = window.localStorage.getItem(STORAGE_ENTRY);

    if (!raw) {
      return {};
    }

    const read = JSON.parse(raw) as Navigation;

    return typeof read === "object" && read !== null ? read : {};
  } catch {
    return {};
  }
}

/** Merges: navigation and theme are written by independent callers. */
export function writeNavigation(patch: Navigation): void {
  try {
    const merged = { ...readNavigation(), ...patch };

    window.localStorage.setItem(STORAGE_ENTRY, JSON.stringify(merged));
  } catch {
    // Storage unavailable or full: the app simply forgets.
  }
}

// Earlier versions kept every typed command here, tokens included.
const HISTORY_KEY = "pupitre.history.v1";

export function dropStoredHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Storage unavailable: nothing to drop.
  }
}
