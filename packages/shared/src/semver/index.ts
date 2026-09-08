import { SEMVER_PATTERN } from "../releases"

const SEMVER_RE = new RegExp(SEMVER_PATTERN)

const NUMERIC_RE = /^\d+$/

interface Parsed {
  core: number[]
  prerelease: string[]
}

export function isSemver(version: string): boolean {
  return SEMVER_RE.test(version)
}

function parse(version: string): Parsed | null {
  const match = SEMVER_RE.exec(version)

  if (!match) {
    return null
  }

  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] ? match[4].split(".") : [],
  }
}

function compareIdentifiers(left: string, right: string): number {
  const leftNumeric = NUMERIC_RE.test(left)
  const rightNumeric = NUMERIC_RE.test(right)

  if (leftNumeric && rightNumeric) {
    return Number(left) - Number(right)
  }

  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1
  }

  return left < right ? -1 : Number(left > right)
}

function comparePrerelease(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) {
    return right.length - left.length
  }

  for (const [index, identifier] of left.entries()) {
    const other = right[index]

    if (other === undefined) {
      return 1
    }

    const verdict = compareIdentifiers(identifier, other)

    if (verdict !== 0) {
      return verdict
    }
  }

  return left.length - right.length
}

export function compareVersions(left: string, right: string): number {
  const parsedLeft = parse(left)
  const parsedRight = parse(right)

  if (!(parsedLeft && parsedRight)) {
    return left < right ? -1 : Number(left > right)
  }

  for (const [index, part] of parsedLeft.core.entries()) {
    const other = parsedRight.core[index] ?? 0

    if (part !== other) {
      return part - other
    }
  }

  return comparePrerelease(parsedLeft.prerelease, parsedRight.prerelease)
}

export function isNewer(candidate: string, current: string | null): boolean {
  return current === null || compareVersions(candidate, current) > 0
}

/**
 * The item carrying the highest version, the first one on a tie.
 */
export function latestBy<T>(
  items: Iterable<T>,
  versionOf: (item: T) => string
): T | null {
  let latest: T | null = null
  let latestVersion: string | null = null

  for (const item of items) {
    const version = versionOf(item)

    if (latestVersion === null || compareVersions(version, latestVersion) > 0) {
      latest = item
      latestVersion = version
    }
  }

  return latest
}

/**
 * The version without its prerelease or metadata: `0.2.0-beta.1` belongs to
 * the `0.2.0` line, and a compatibility sheet that places it there says what
 * we mean, where semver ordering would place it just before.
 */
export function coreVersion(version: string): string | null {
  const match = SEMVER_RE.exec(version)

  return match ? `${match[1]}.${match[2]}.${match[3]}` : null
}
