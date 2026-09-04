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
export const LOWEST_PORT = 1024;

const GIT_SCHEMES = ["http://", "https://", "ssh://", "git://"];

const SCP_LIKE = /^[^/\s]+@[^/\s]+:/;

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
  const trimmed = value.trim().replace(/\/+$/, "");

  if (trimmed.length === 0) {
    return "";
  }

  const segment = trimmed.split(/[/:]/).at(-1) ?? "";
  const stem = segment.replace(/\.git$/i, "");

  return stem
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/[-._]+$/, "");
}

/** A folder path the registry accepts: relative to the projects root, no "..". */
export function folderFromSource(value: string, name: string): string {
  if (isGitSource(value)) {
    return name;
  }

  const cleaned = value.trim().replace(/^\/+/, "").replace(/\/+$/, "");

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
 * A refusal on a taken port ends with the next free one — "par exemple 3001." —
 * and taking it from there beats guessing a second time from a list the agent
 * has just proved to be stale.
 */
export function portFromFix(fix: string | undefined): number | null {
  if (!fix) {
    return null;
  }

  const numbers = fix.match(/\d+/g) ?? [];

  for (const raw of [...numbers].reverse()) {
    const port = Number(raw);

    if (port >= LOWEST_PORT && port <= LAST_PORT) {
      return port;
    }
  }

  return null;
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
