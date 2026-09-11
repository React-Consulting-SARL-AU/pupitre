/**
 * Where the app's own update stands, as the About screen reads it.
 *
 * The main process checks, downloads and installs; the window only ever sees
 * this state and asks for the two gestures — look now, restart to install.
 */
export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "ready"
  | "error";

export interface AppUpdateState {
  status: AppUpdateStatus;
  /** Whether this build updates itself at all: not from a dev folder, not a .deb. */
  updates: boolean;
  /** The version found, from `available` on. */
  version?: string;
  /** How far the download is, from 0 to 100, while `downloading`. */
  percent?: number;
  /** What went wrong, in the updater's own words, while `error`. */
  error?: string;
  /** When the feed was last asked, as an ISO date. */
  checkedAt?: string;
}

/** What the About screen says of this build: its version and the channel it follows. */
export interface AppAbout {
  version: string;
  /** Null for a build that does not update itself: a dev folder, a .deb. */
  channel: "stable" | "beta" | null;
}
