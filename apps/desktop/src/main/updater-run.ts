import { basename } from "node:path";
import { PUPITRE_ORIGINS } from "@pupitre/shared/legal";
import {
  RELEASE_CHANNELS,
  type ReleaseChannel,
} from "@pupitre/shared/releases";
import {
  signedAppMessage,
  signedArtefactOf,
} from "../../scripts/release-artefacts";
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

export const DEFAULT_DOWNLOADS_URL = PUPITRE_ORIGINS.downloads;

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

/**
 * What electron-updater is handed, and nothing more: the channel is the
 * folder the URL ends with, whose feed is `latest*.yml`. Named as a channel
 * too, it would look for `<channel>-mac.yml` instead, which nobody publishes.
 */
export interface UpdateFeed {
  provider: "generic";
  url: string;
}

export type UpdaterPlan =
  | { updates: false; reason: "development" | "unsupported" }
  | { updates: true; channel: ReleaseChannel; feed: UpdateFeed };

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
  /** The artefact's file name, which says which system and chip it is for. */
  file: string;
  /** The hex SHA-256 of the bytes on disk. */
  sha256: string;
  version: string;
  /** The base64 Ed25519 signature published next to the artefact. */
  signature: string;
}

/** A download the release key vouched for: that file, with those bytes. */
export interface VerifiedUpdate {
  file: string;
  sha256: string;
  version: string;
}

/**
 * Whether a downloaded artefact is the one the release key signed.
 *
 * The signature binds the digest to the version, the system and the chip, the
 * way the release chain wrote it: an authentic artefact of another version,
 * or of another architecture, is refused too. It holds on the three systems —
 * the AppImage, the NSIS installer, and the `.zip` electron-updater fetches on
 * macOS, which carries the system and chip of the `.dmg` it is built beside.
 * macOS and Windows check their platform's own signature on top of it.
 */
export function checkAppArtefact(
  downloaded: DownloadedArtefact,
  publicKey: string
): boolean {
  const artefact = signedArtefactOf(basename(downloaded.file));

  if (!artefact) {
    return false;
  }

  const message = signedAppMessage(
    downloaded.version,
    artefact.os,
    artefact.arch,
    downloaded.sha256
  );

  return signatureHolds(message, downloaded.signature.trim(), publicKey);
}

/**
 * Whether the file electron-updater is about to install is the one verified,
 * with the bytes it had then. Anything else — nothing verified, another file,
 * bytes that changed or no longer read — is not installed.
 */
export function installable(
  verified: VerifiedUpdate | null,
  pending: string | null,
  digestOf: (file: string) => string | null
): boolean {
  if (!(verified && pending) || pending !== verified.file) {
    return false;
  }

  return digestOf(pending) === verified.sha256;
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
    channel,
    feed: { provider: "generic", url: feedUrl(channel, environment.downloads) },
    updates: true,
  };
}
