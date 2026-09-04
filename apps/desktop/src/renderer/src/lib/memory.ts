/**
 * What the interface remembers between two launches.
 *
 * Navigation and the theme: which server, which project, which tab of which
 * project, and light or dark. No data and no secret — those belong to the
 * server, and re-reading them costs one command. If this file disappears, the
 * app opens on the dashboard following the system theme, and nothing else is
 * lost.
 *
 * Every access is wrapped: `localStorage` throws outright in a few contexts
 * (private windows, site data blocked), and a navigation convenience must never
 * be the reason the app fails to start.
 */
const KEY = "pupitre.navigation.v1";

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
  /** "system", "light" or "dark". Validated on read: last run wrote it. */
  theme?: string;
  /** "system", "en" or "fr". Validated on read: last run wrote it. */
  locale?: string;
}

export function readNavigation(): Navigation {
  try {
    const raw = window.localStorage.getItem(KEY);
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
    window.localStorage.setItem(KEY, JSON.stringify(merged));
  } catch {
    // Storage unavailable or full: the app simply forgets, which is the state it
    // was in before this file existed.
  }
}

const HISTORY_KEY = "pupitre.history.v1";

/** The lines run in the app's own terminals, one list per server. */
function readAllHistory(): Record<string, string[]> {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const read = raw ? (JSON.parse(raw) as Record<string, string[]>) : {};

    return typeof read === "object" && read !== null ? read : {};
  } catch {
    return {};
  }
}

export function readHistory(serverId: string): string[] {
  const kept = readAllHistory()[serverId];

  return Array.isArray(kept)
    ? kept.filter((entry) => typeof entry === "string")
    : [];
}

export function writeHistory(
  serverId: string,
  entries: readonly string[]
): void {
  try {
    const all = { ...readAllHistory(), [serverId]: [...entries] };

    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(all));
  } catch {
    // Same as the navigation: a convenience, never a reason to fail.
  }
}
