import type {
  DesktopArchitecture,
  DesktopSystem,
} from "@pupitre/shared/releases";

export interface Artefact {
  file: string;
  os: DesktopSystem;
  arch: DesktopArchitecture;
  format: string;
}

export const FEEDS = ["latest.yml", "latest-mac.yml", "latest-linux.yml"];

const FORMATS: Record<string, DesktopSystem> = {
  dmg: "macos",
  exe: "windows",
  AppImage: "linux",
  deb: "linux",
};

/** `.deb` filenames carry Debian's `amd64`; the platform keeps Electron's `x64`. */
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

/** A file whose name does not state its architecture is not published: the download page must name its machine. */
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

/** electron-updater updates macOS from the `.zip`, never the dmg, so the zip belongs to the dmg of its build. */
export function installerOf(file: string): string {
  const mapped = isBlockmap(file) ? file.slice(0, -".blockmap".length) : file;

  return mapped.replace(UPDATE_ARCHIVE_RE, ".dmg");
}

export function isCompanion(file: string): boolean {
  return file !== installerOf(file) && artefactOf(installerOf(file)) !== null;
}

export function isUpdateArchive(file: string): boolean {
  return UPDATE_ARCHIVE_RE.test(file) && isCompanion(file);
}

export function signedArtefactOf(file: string): Artefact | null {
  return artefactOf(isUpdateArchive(file) ? installerOf(file) : file);
}

/** A published version never moves: one folder per version. */
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

/** The preamble differs from the agent's so an agent signature can never pass for an app one, or the reverse. */
export function signedAppMessage(
  version: string,
  os: string,
  arch: string,
  sha256: string
): Buffer {
  return Buffer.from(`pupitre-app\n${version}\n${os}\n${arch}\n${sha256}\n`);
}

/** Feeds live in the channel folder but installers in the version folder, so relative entries would miss. */
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
