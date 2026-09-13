import { compareVersions } from "@pupitre/shared/semver"

export function byVersionDesc<T>(
  items: T[],
  versionOf: (item: T) => string
): T[] {
  return [...items].sort((a, b) => compareVersions(versionOf(b), versionOf(a)))
}
