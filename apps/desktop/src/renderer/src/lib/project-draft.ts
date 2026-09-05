import type { Remedy } from "@pupitre/shared/agent-protocol/errors";
import type { PackageManager } from "@pupitre/shared/agent-protocol/state";

/**
 * What can be worked out about a project before the server is asked anything.
 *
 * Everything here is a proposal: a name read off a repository address, a port
 * no declared project holds, a start command that matches the package manager.
 * The agent stays the authority — it refuses what it cannot honour, and its
 * refusal carries the port to use instead.
 */

export const FIRST_PORT = 3000;
export const LAST_PORT = 65_535;

const GIT_SCHEMES = ["http://", "https://", "ssh://", "git://"];

const SCP_LIKE = /^[^/\s]+@[^/\s]+:/;

const TRAILING_SLASHES = /\/+$/;

const LEADING_SLASHES = /^\/+/;

const PATH_SEPARATOR = /[/:]/;

const GIT_SUFFIX = /\.git$/i;

const NOT_NAME = /[^a-z0-9._-]+/g;

const DOUBLE_DASH = /-{2,}/g;

const LEADING_NOISE = /^[^a-z0-9]+/;

const TRAILING_NOISE = /[-._]+$/;

export function isGitSource(value: string): boolean {
  const trimmed = value.trim();

  return (
    GIT_SCHEMES.some((scheme) => trimmed.startsWith(scheme)) ||
    SCP_LIKE.test(trimmed) ||
    trimmed.endsWith(".git")
  );
}

/**
 * A project name the registry accepts, read off an address or a folder.
 *
 * The pattern is the protocol's own: lowercase, digits, dot, dash, underscore,
 * starting on a letter or a digit. What does not fit becomes a dash rather than
 * disappearing, so two different repositories never collapse into one name.
 */
export function nameFromSource(value: string): string {
  const trimmed = value.trim().replace(TRAILING_SLASHES, "");

  if (trimmed.length === 0) {
    return "";
  }

  const segment = trimmed.split(PATH_SEPARATOR).at(-1) ?? "";
  const stem = segment.replace(GIT_SUFFIX, "");

  return stem
    .toLowerCase()
    .replace(NOT_NAME, "-")
    .replace(DOUBLE_DASH, "-")
    .replace(LEADING_NOISE, "")
    .replace(TRAILING_NOISE, "");
}

/** A folder path the registry accepts: relative to the projects root, no "..". */
export function folderFromSource(value: string, name: string): string {
  if (isGitSource(value)) {
    return name;
  }

  const cleaned = value
    .trim()
    .replace(LEADING_SLASHES, "")
    .replace(TRAILING_SLASHES, "");

  return cleaned.length > 0 && !cleaned.includes("..") ? cleaned : name;
}

export function freePort(taken: readonly number[], from = FIRST_PORT): number {
  const held = new Set(taken);

  for (let port = Math.max(from, FIRST_PORT); port <= LAST_PORT; port += 1) {
    if (!held.has(port)) {
      return port;
    }
  }

  return FIRST_PORT;
}

/**
 * The port the agent named in its remedy.
 *
 * A refusal on a taken port carries the next free one as a value, and taking it
 * from there beats guessing a second time from a list the agent has just proved
 * to be stale. The sentence beside it is for the reader, not for the app: a
 * wording changes, a field does not.
 */
export function portFromRemedy(remedy: Remedy | undefined): number | null {
  return remedy?.code === "port_taken" ? remedy.port_free : null;
}

const COMMANDS: Partial<Record<PackageManager, (port: number) => string>> = {
  bun: (port) => `bun run dev --port ${port}`,
  gradle: (port) => `./gradlew bootRun --args='--server.port=${port}'`,
  npm: (port) => `npm run dev -- --port ${port}`,
  pnpm: (port) => `pnpm dev --port ${port}`,
  uv: (port) => `uv run dev --port ${port}`,
};

export function startCommand(pkgmgr: PackageManager, port: number): string {
  return COMMANDS[pkgmgr]?.(port) ?? "";
}
