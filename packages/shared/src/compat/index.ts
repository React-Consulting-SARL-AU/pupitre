import { compareVersions, coreVersion, isSemver } from "../semver"

export interface Generation {
  protocol: number
  app: string
  agent: string
}

// A row starts where one side can no longer drive the other, even on the same protocol: 0.x apps never open `serve --privileged`.
export const GENERATIONS: readonly Generation[] = [
  { protocol: 1, app: "0.1.0", agent: "0.1.0" },
  { protocol: 2, app: "0.2.0", agent: "0.2.0" },
  { protocol: 2, app: "1.0.0", agent: "1.0.0" },
  { protocol: 3, app: "2.0.0", agent: "2.0.0" },
]

type Side = "app" | "agent"

// `unknown` is a development build: rejecting it in the name of a table being written helps no one.
export type CompatibilityVerdict =
  | "ok"
  | "agent_too_old"
  | "app_too_old"
  | "unknown"

function indexOf(side: Side, version: string): number | null {
  const core = coreVersion(version)

  if (core === null) {
    return null
  }

  let found: number | null = null

  for (const [index, generation] of GENERATIONS.entries()) {
    if (compareVersions(core, generation[side]) >= 0) {
      found = index
    }
  }

  return found
}

export function generationOf(side: Side, version: string): Generation | null {
  const index = indexOf(side, version)

  return index === null ? null : (GENERATIONS[index] ?? null)
}

export function agentFloorFor(appVersion: string): string | null {
  return generationOf("app", appVersion)?.agent ?? null
}

export function compatibility(
  appVersion: string,
  agentVersion: string
): CompatibilityVerdict {
  const app = indexOf("app", appVersion)
  const agent = indexOf("agent", agentVersion)

  if (!(isSemver(appVersion) && isSemver(agentVersion))) {
    return "unknown"
  }

  if (app === null) {
    return "app_too_old"
  }

  if (agent === null) {
    return "agent_too_old"
  }

  if (app === agent) {
    return "ok"
  }

  return app > agent ? "agent_too_old" : "app_too_old"
}
