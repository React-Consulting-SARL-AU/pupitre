import type { Entitlement } from "@pupitre/shared/agent-protocol/session";

/**
 * The agent the app carries, next to the one the server runs.
 *
 * The app has no list of published versions and asks none: what it can offer a
 * server is the binary embedded at build time, with the notes of that version
 * and, when it has it, the signature the agent falls back on. Comparing the two
 * is all this file does — the decision of what to show belongs to the screen,
 * and the decision of what to install belongs to the agent.
 */

export interface CarriedAgent {
  version: string;
  arch: string;
  notes: readonly string[];
  /** Whether the app also carries the signature this architecture requires. */
  signed: boolean;
}

export type VersionOrder = "ahead" | "same" | "behind" | "unknown";

export interface AgentUpdateState {
  /** The version the server answered, or nothing on a machine without agent. */
  installed: string | null;
  carried: CarriedAgent | null;
  order: VersionOrder;
  /** Whether the platform still answers this server, and can sign for it. */
  platform: boolean;
}

/**
 * The fingerprint and the signature come from the platform, which the agent
 * reads with its server token: a server it still reaches needs nothing from the
 * app. `restricted` is a server that lost it seven days ago, `dev` one that
 * never had it, and an agent too old to speak the protocol answers neither.
 */
export function platformAnswers(entitlement: Entitlement | null): boolean {
  return entitlement === "valid" || entitlement === "grace";
}

const SEMVER = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/;

export function versionCore(version: string): [number, number, number] | null {
  const found = SEMVER.exec(version.trim());

  if (!found) {
    return null;
  }

  return [Number(found[1]), Number(found[2]), Number(found[3])];
}

/**
 * A build that is not semver — `git describe` on an untagged commit — compares
 * to nothing: saying so is the honest answer, and it keeps the app from
 * offering an update it cannot justify.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = versionCore(a);
  const right = versionCore(b);

  if (!(left && right)) {
    return null;
  }

  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) {
      return left[i] < right[i] ? -1 : 1;
    }
  }

  return 0;
}

export function orderOf(
  carried: string | null,
  installed: string | null
): VersionOrder {
  if (!(carried && installed)) {
    return "unknown";
  }

  const compared = compareVersions(carried, installed);

  if (compared === null) {
    return "unknown";
  }

  if (compared === 0) {
    return "same";
  }

  return compared > 0 ? "ahead" : "behind";
}
