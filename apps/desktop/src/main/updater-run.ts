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

export const DEFAULT_DOWNLOADS_URL = PUPITRE_ORIGINS.downloads;

export const DEFAULT_UPDATE_CHANNEL: ReleaseChannel = "stable";

const TRAILING_SLASHES = /\/+$/;

export interface UpdaterEnvironment {
  packaged: boolean;
  platform: NodeJS.Platform;
  channel: string | undefined;
  downloads: string | undefined;
  /** Set by the AppImage runtime, and by nothing else. */
  appImage: string | undefined;
}

/** No channel field: electron-updater would then look for `<channel>-mac.yml`, which nobody publishes. */
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

/** Same `PUPITRE_DOWNLOADS_URL` as the publishing script, so a build and its release never name two buckets. */
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
  file: string;
  sha256: string;
  version: string;
  signature: string;
}

export interface VerifiedUpdate {
  file: string;
  sha256: string;
  version: string;
}

/** The signature binds digest, version, system and chip: an authentic artefact of another build is refused. */
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

export function signatureUrl(fileUrl: string, feedUrl: string): string {
  return `${new URL(fileUrl, `${feedUrl.replace(TRAILING_SLASHES, "")}/`).toString()}.sig`;
}

/** A `.deb` belongs to apt: replacing its files would leave the package manager describing a missing version. */
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
