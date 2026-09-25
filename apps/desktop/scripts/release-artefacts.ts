import type {
  DesktopArchitecture,
  DesktopSystem,
} from "@pupitre/shared/releases";

/**
 * What a release build leaves in `dist/`, read file by file.
 *
 * Nothing here touches disk or network: naming an artefact, saying where it
 * goes, and writing the message the release key signs. The publish script
 * does the rest, and these functions can be tested without it.
 */

export interface Artefact {
  file: string;
  os: DesktopSystem;
  arch: DesktopArchitecture;
  format: string;
}

/** The feeds electron-updater reads: one per OS, written by electron-builder. */
export const FEEDS = ["latest.yml", "latest-mac.yml", "latest-linux.yml"];

const FORMATS: Record<string, DesktopSystem> = {
  dmg: "macos",
  exe: "windows",
  AppImage: "linux",
  deb: "linux",
};

/**
 * Architecture names as they appear across the pipeline. `amd64` is Debian's,
 * carried in `.deb` filenames; `x64` is Electron's, and the one the platform
 * keeps.
 */
const ARCHITECTURES: Record<string, DesktopArchitecture> = {
  x64: "x64",
  amd64: "x64",
  x86_64: "x64",
  arm64: "arm64",
  aarch64: "arm64",
  universal: "universal",
};

const NAME_RE = /^[^/\\]+$/;

const TRAILING_SLASH_RE = /\/+$/;

const FEED_ENTRY_RE = /^(\s*(?:-\s+)?(?:url|path):\s*)(\S+)\s*$/gm;

function formatOf(file: string): string | null {
  const extension = file.slice(file.lastIndexOf(".") + 1);

  return extension in FORMATS ? extension : null;
}

function archOf(file: string): DesktopArchitecture | null {
  const stem = file.slice(0, file.lastIndexOf("."));

  for (const [name, arch] of Object.entries(ARCHITECTURES)) {
    if (stem.endsWith(`-${name}`) || stem.endsWith(`_${name}`)) {
      return arch;
    }
  }

  return null;
}

/**
 * A publishable artefact, or nothing.
 *
 * A `.blockmap` accompanies an installer for differential updates, a `.yml`
 * is a feed: both go into the bucket, neither is a row in the version table.
 * A file whose name doesn't state its architecture is not published either —
 * the download page must be able to say which machine it targets.
 */
export function artefactOf(file: string): Artefact | null {
  if (!NAME_RE.test(file)) {
    return null;
  }

  const format = formatOf(file);
  const arch = archOf(file);

  if (!(format && arch)) {
    return null;
  }

  return { arch, file, format, os: FORMATS[format] as DesktopSystem };
}

export function isFeed(file: string): boolean {
  return FEEDS.includes(file);
}

export function isBlockmap(file: string): boolean {
  return file.endsWith(".blockmap");
}

const UPDATE_ARCHIVE_RE = /\.zip$/;

/**
 * The installer a file accompanies: itself for an installer, the installer
 * a `.blockmap` maps, the `.dmg` of the same build for the `.zip` that
 * electron-updater downloads on macOS — it never updates from a dmg, and a
 * person never installs from the zip, so the zip goes to the bucket beside
 * the dmg and is a row nowhere.
 */
export function installerOf(file: string): string {
  const mapped = isBlockmap(file) ? file.slice(0, -".blockmap".length) : file;

  return mapped.replace(UPDATE_ARCHIVE_RE, ".dmg");
}

/** A file the updater fetches beside an installer, kept in the bucket without a row of its own. */
export function isCompanion(file: string): boolean {
  return file !== installerOf(file) && artefactOf(installerOf(file)) !== null;
}

/** The `.zip` electron-updater installs from on macOS: signed like an installer, a row nowhere. */
export function isUpdateArchive(file: string): boolean {
  return UPDATE_ARCHIVE_RE.test(file) && isCompanion(file);
}

/**
 * The system and chip a release signature names for a file: its own for an
 * installer, the `.dmg`'s for the update archive built beside it. A blockmap
 * or a feed carries no signature.
 */
export function signedArtefactOf(file: string): Artefact | null {
  return artefactOf(isUpdateArchive(file) ? installerOf(file) : file);
}

/** A version never moves once published: one folder per version, feeds alongside. */
export function objectKey(version: string, file: string): string {
  return `app/${version}/${file}`;
}

export function feedKey(channel: string, file: string): string {
  return `app/${channel}/${file}`;
}

export function downloadUrl(
  base: string,
  version: string,
  file: string
): string {
  return `${base.replace(TRAILING_SLASH_RE, "")}/${objectKey(version, file)}`;
}

/**
 * What the release key signs for an app artefact.
 *
 * The same gesture as for the agent — `apps/agent/internal/release` — with a
 * different preamble, so an agent signature can never pass for an app one, or
 * the reverse.
 */
export function signedAppMessage(
  version: string,
  os: string,
  arch: string,
  sha256: string
): Buffer {
  return Buffer.from(`pupitre-app\n${version}\n${os}\n${arch}\n${sha256}\n`);
}

/**
 * Feeds name their files relatively, resolved against the feed URL.
 *
 * Artefacts live in their version's folder and feeds in their channel's:
 * without this rewrite an app would look for its installer in the channel
 * folder, where it is not.
 */
export function absoluteFeed(
  yaml: string,
  base: string,
  version: string
): string {
  return yaml.replace(FEED_ENTRY_RE, (line, prefix: string, value: string) =>
    value.includes("://")
      ? line
      : `${prefix}${downloadUrl(base, version, value)}`
  );
}
