import {
  RELEASE_CHANNELS,
  type ReleaseChannel,
} from "@pupitre/shared/releases";

/**
 * Whether this copy of the app may replace itself, and where it looks.
 *
 * The artefacts are public: they sit in the release bucket behind
 * `dl.pupitre.studio`, one immutable folder per version, and one folder per
 * channel holding the update feed electron-updater reads. Nothing here is a
 * secret, and a build carries no token — the platform is asked nothing to
 * update the app, which is what keeps an app usable while the platform is not.
 */

export const DEFAULT_DOWNLOADS_URL = "https://dl.pupitre.studio";

export const DEFAULT_UPDATE_CHANNEL: ReleaseChannel = "stable";

const TRAILING_SLASHES = /\/+$/;

export interface UpdaterEnvironment {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** The channel this build follows, from the build environment. */
  channel: string | undefined;
  /** The bucket the publishing side wrote to, from the build environment. */
  downloads: string | undefined;
  /** Set by the AppImage runtime, and by nothing else. */
  appImage: string | undefined;
}

export interface UpdateFeed {
  provider: "generic";
  url: string;
  channel: ReleaseChannel;
}

export type UpdaterPlan =
  | { updates: false; reason: "development" | "unsupported" }
  | { updates: true; feed: UpdateFeed };

function channelOf(wanted: string | undefined): ReleaseChannel {
  return RELEASE_CHANNELS.includes(wanted as ReleaseChannel)
    ? (wanted as ReleaseChannel)
    : DEFAULT_UPDATE_CHANNEL;
}

/** Same `PUPITRE_DOWNLOADS_URL` as the publishing script, so a build and the release it looks for never name two different buckets. */
export function updateBaseUrl(downloads: string | undefined): string {
  const base = downloads?.trim() || DEFAULT_DOWNLOADS_URL;

  return `${base.replace(TRAILING_SLASHES, "")}/app`;
}

export function feedUrl(
  channel: ReleaseChannel,
  downloads?: string | undefined
): string {
  return `${updateBaseUrl(downloads)}/${channel}`;
}

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

  const channel = channelOf(environment.channel);

  return {
    feed: {
      channel,
      provider: "generic",
      url: feedUrl(channel, environment.downloads),
    },
    updates: true,
  };
}
