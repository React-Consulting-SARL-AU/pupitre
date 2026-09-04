/**
 * Whether this copy of the app may replace itself, and where it looks.
 *
 * The releases are private: the repository is closed, so the feed is the GitHub
 * API rather than a public download, and it answers nothing without a token.
 * The release workflow puts that token into the build, where it ends up inside
 * the bytecode of the main process — it is never written in the repository, and
 * a build made without it simply does not update.
 */

export const UPDATE_OWNER = "jordanmonier";
export const UPDATE_REPO = "pupitre";

export interface UpdaterEnvironment {
  packaged: boolean;
  platform: NodeJS.Platform;
  token: string | undefined;
  /** Set by the AppImage runtime, and by nothing else. */
  appImage: string | undefined;
}

export interface UpdateFeed {
  provider: "github";
  owner: string;
  repo: string;
  private: true;
  token: string;
}

export type UpdaterPlan =
  | { updates: false; reason: "development" | "no_token" | "unsupported" }
  | { updates: true; feed: UpdateFeed };

/**
 * A `.deb` is installed by apt and updated by apt: replacing its files from
 * inside the app would leave the package manager describing a version that is
 * no longer on disk. The AppImage is a single file the app owns, so that one it
 * may replace.
 */
export function updaterPlan(environment: UpdaterEnvironment): UpdaterPlan {
  if (!environment.packaged) {
    return { reason: "development", updates: false };
  }

  if (environment.platform === "linux" && !environment.appImage) {
    return { reason: "unsupported", updates: false };
  }

  if (!environment.token) {
    return { reason: "no_token", updates: false };
  }

  return {
    feed: {
      owner: UPDATE_OWNER,
      private: true,
      provider: "github",
      repo: UPDATE_REPO,
      token: environment.token,
    },
    updates: true,
  };
}
