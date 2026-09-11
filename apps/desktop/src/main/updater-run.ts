import { createHash } from "node:crypto";
import { basename } from "node:path";
import {
  RELEASE_CHANNELS,
  type ReleaseChannel,
} from "@pupitre/shared/releases";
import { artefactOf, signedAppMessage } from "../../scripts/release-artefacts";
import { signatureHolds } from "./agent-release";

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

export interface DownloadedArtefact {
  bytes: Uint8Array;
  /** The artefact's file name, which says which system and chip it is for. */
  file: string;
  version: string;
  /** The base64 Ed25519 signature published next to the artefact. */
  signature: string;
}

/**
 * Whether a downloaded artefact is the one the release key signed.
 *
 * The signature binds the digest to the version, the system and the chip, the
 * way the release chain wrote it: an authentic AppImage of another
 * version, or of another architecture, is refused too. macOS and Windows have
 * their platform's own signature checked by electron-updater; Linux has none,
 * and this is what stands in for it.
 */
export function checkAppArtefact(
  downloaded: DownloadedArtefact,
  publicKey: string
): boolean {
  const artefact = artefactOf(basename(downloaded.file));

  if (!artefact) {
    return false;
  }

  const sha256 = createHash("sha256").update(downloaded.bytes).digest("hex");
  const message = signedAppMessage(
    downloaded.version,
    artefact.os,
    artefact.arch,
    sha256
  );

  return signatureHolds(message, downloaded.signature.trim(), publicKey);
}

/**
 * Where the signature of an artefact sits: next to it, under the same name.
 *
 * The feed names its files relatively or, once the publishing script has
 * rewritten it, absolutely; both resolve against the feed's own folder.
 */
export function signatureUrl(fileUrl: string, feedUrl: string): string {
  return `${new URL(fileUrl, `${feedUrl.replace(TRAILING_SLASHES, "")}/`).toString()}.sig`;
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
