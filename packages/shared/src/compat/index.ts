import { compareVersions, coreVersion, isSemver } from "../semver"

/**
 * The compatibility sheet between the app and the agent.
 *
 * The app and the agent ship on the same tag, but a fleet doesn't update all
 * at once: a new app drives servers still running an older agent, and an
 * updated agent serves apps still running an older version. What binds them
 * isn't their version number, it's the protocol generation they speak.
 *
 * A generation starts at the app version and agent version where the
 * protocol changed shape — a field removed or renamed. As long as no row is
 * added here, every app version drives every agent version, and that's the
 * truth we want to state.
 *
 * This table is the single source: it feeds the contract schema read by the
 * agent, the app reads it to say which server to update first, and nothing
 * else restates the same rule.
 */
export interface Generation {
  /** The contract integer this generation speaks. */
  protocol: number
  /** The first app version of the generation. */
  app: string
  /** The first agent version of the generation. */
  agent: string
}

export const GENERATIONS: readonly Generation[] = [
  { protocol: 1, app: "0.1.0", agent: "0.1.0" },
]

export type Side = "app" | "agent"

/**
 * `unknown` covers a development build, whose version isn't semver: rejecting
 * a developer in the name of a table they're currently writing helps no one.
 */
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

/** The oldest agent this app version knows how to drive. */
export function agentFloorFor(appVersion: string): string | null {
  return generationOf("app", appVersion)?.agent ?? null
}

/** The oldest app this agent version agrees to serve. */
export function appFloorFor(agentVersion: string): string | null {
  return generationOf("agent", agentVersion)?.app ?? null
}

export function protocolOf(side: Side, version: string): number | null {
  return generationOf(side, version)?.protocol ?? null
}

/**
 * The verdict reads in a single direction: whichever of the two is behind
 * the other is the one that needs updating.
 */
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
