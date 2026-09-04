/**
 * What the interface remembers between two launches.
 *
 * Only navigation: which server, which project, which tab of which project. No
 * data and no secret — those belong to the server, and re-reading them costs one
 * command. If this file disappears, the app opens on the dashboard and nothing
 * else is lost.
 *
 * Every access is wrapped: `localStorage` throws outright in a few contexts
 * (private windows, site data blocked), and a navigation convenience must never
 * be the reason the app fails to start.
 */
const KEY = "pupitre.navigation.v1";

export type Navigation = {
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
};

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

export function writeNavigation(navigation: Navigation): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(navigation));
  } catch {
    // Storage unavailable or full: the app simply forgets, which is the state it
    // was in before this file existed.
  }
}
