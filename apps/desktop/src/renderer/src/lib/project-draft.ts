import type { Remedy } from "@pupitre/shared/agent-protocol/errors";
import {
  type PackageManager,
  SUBDOMAIN_MAX,
  SUBDOMAIN_PATTERN,
} from "@pupitre/shared/agent-protocol/state";

export const FIRST_PORT = 3000;
export const LAST_PORT = 65_535;

const GIT_SCHEMES = ["http://", "https://", "ssh://", "git://"];

const SCP_LIKE = /^[^/\s]+@[^/\s]+:/;

const TRAILING_SLASHES = /\/+$/;

const LEADING_SLASHES = /^\/+/;

const PATH_SEPARATOR = /[/:]/;

const GIT_SUFFIX = /\.git$/i;

const NOT_NAME = /[^a-z0-9._-]+/g;

const NOT_SUBDOMAIN = /[^a-z0-9]+/g;

const DOUBLE_DASH = /-{2,}/g;

const LEADING_NOISE = /^[^a-z0-9]+/;

const TRAILING_NOISE = /[-._]+$/;

const TRAILING_DASH = /-+$/;

// Past that many namesakes the reader is better off naming the thing themselves.
const LAST_RANK = 99;

export function isGitSource(value: string): boolean {
  const trimmed = value.trim();

  return (
    GIT_SCHEMES.some((scheme) => trimmed.startsWith(scheme)) ||
    SCP_LIKE.test(trimmed) ||
    trimmed.endsWith(".git")
  );
}

/** Unfit characters become dashes rather than vanish, so two repositories never share a name. */
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

/** A project name may hold dots and underscores, a DNS label neither, so both fold into dashes. */
export function subdomainFromName(name: string): string {
  return name
    .toLowerCase()
    .replace(NOT_SUBDOMAIN, "-")
    .replace(DOUBLE_DASH, "-")
    .replace(LEADING_NOISE, "")
    .replace(TRAILING_DASH, "");
}

export function validSubdomain(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= SUBDOMAIN_MAX &&
    SUBDOMAIN_PATTERN.test(value)
  );
}

/** A warning, not a refusal: a universal certificate lacks it, but the client may own Advanced Certificate Manager. */
export function spansSeveralLevels(value: string): boolean {
  return value.includes(".");
}

export function freeSubdomain(name: string, taken: readonly string[]): string {
  const base = subdomainFromName(name);

  if (base.length === 0) {
    return "";
  }

  const held = new Set(taken);

  for (let rank = 1; rank <= LAST_RANK; rank += 1) {
    const candidate = rank === 1 ? base : `${base}-${rank}`;

    if (!held.has(candidate)) {
      return candidate;
    }
  }

  return base;
}

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
