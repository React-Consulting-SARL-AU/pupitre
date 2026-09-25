/**
 * What the interface remembers between two launches.
 *
 * Navigation and the theme: which project, which tab of which project, which
 * terminals were open, and light or dark. No data and no secret — those belong
 * to the server, and re-reading them costs one command. If this file
 * disappears, the app opens on the dashboard following the system theme, with
 * no tab in the terminals, and nothing else is lost.
 *
 * Every access is wrapped: `localStorage` throws outright in a few contexts
 * (private windows, site data blocked), and a navigation convenience must never
 * be the reason the app fails to start.
 */
const STORAGE_ENTRY = "pupitre.navigation.v1";

/**
 * A tab as the last run left it, read back as it was written.
 *
 * Everything is optional: this comes off a disk another version may have
 * written, and the store validates each field before making a tab of it.
 */
export interface RememberedTerminal {
  id?: string;
  kind?: string;
  title?: string;
  project?: string | null;
  dir?: string | null;
  /** The tmux session the tab was attached to, so it finds it again. */
  session?: string | null;
}

export interface Navigation {
  /** The last view, so a relaunch lands where you left off. */
  view?: string;
  /** The last selected project. */
  project?: string;
  /**
   * The last tab open on each project, by project name.
   *
   * That is the one that matters: leaving a project on its Claude tab and coming
   * back to its overview means finding the session again by hand, every time.
   */
  tabs?: Record<string, string>;
  /**
   * The terminal tabs that were open, in their order.
   *
   * They come back closed: what they name on the server outlives the app, and
   * reattaching to ten sessions nobody asked for would be ten connections at
   * launch.
   */
  terminals?: RememberedTerminal[];
  /** The tab in front of each group of sessions, by group key. */
  terminalTabs?: Record<string, string>;
  /** The server terminal that was in front. */
  terminal?: string;
  /** "system", "light" or "dark". Validated on read: last run wrote it. */
  theme?: string;
  /** "system", "en" or "fr". Validated on read: last run wrote it. */
  locale?: string;
  /** How the file browser lists a folder: hidden entries shown, and the order. Validated on read. */
  files?: { hidden?: boolean; sort?: string };
  /** The look of the terminals: size, face, scrollback, blink. Validated on read. */
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

/**
 * Merges rather than replaces: navigation and theme are written by two
 * independent callers, and neither should erase what the other just said.
 */
export function writeNavigation(patch: Navigation): void {
  try {
    const merged = { ...readNavigation(), ...patch };
    window.localStorage.setItem(STORAGE_ENTRY, JSON.stringify(merged));
  } catch {
    // Storage unavailable or full: the app simply forgets, which is the state it
    // was in before this file existed.
  }
}

/** Where earlier versions kept every typed command, tokens included. */
const HISTORY_KEY = "pupitre.history.v1";

export function dropStoredHistory(): void {
  try {
    window.localStorage.removeItem(HISTORY_KEY);
  } catch {
    // Storage unavailable: there is nothing in it to drop.
  }
}
