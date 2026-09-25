export type AppUpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "verifying"
  | "ready"
  | "error";

/** `refused`: the release key rejected the download; `changed`: the file changed after verification. */
export type AppUpdateFailure = "failed" | "refused" | "changed";

export interface AppUpdateState {
  status: AppUpdateStatus;
  /** False from a dev folder or a .deb. */
  updates: boolean;
  version?: string;
  percent?: number;
  failure?: AppUpdateFailure;
  /** ISO date. */
  checkedAt?: string;
}

export interface AppAbout {
  version: string;
  /** Null for a build that does not update itself: a dev folder, a .deb. */
  channel: "stable" | "beta" | null;
}
